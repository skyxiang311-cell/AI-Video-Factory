import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {BookMapSchema, type BookMap} from "../src/research/book/book-map-schema";
import {InterrogativeDeepReadSchema, type InterrogativeDeepRead} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema, type ChapterAnalysis} from "../src/research/book/knowledge-schema";
import type {
  WholeBookSynthesisInput,
  WholeBookSynthesisProvider,
} from "../src/research/book/whole-book-synthesis-provider";
import {
  createOrReuseWholeBookSynthesis,
} from "../src/research/book/whole-book-synthesis-service";
import {
  WholeBookArgumentSynthesisSchema,
  type WholeBookArgumentSynthesis,
} from "../src/research/book/whole-book-argument-synthesis-schema";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, {force: true, recursive: true})
  )));
});

const loadFixture = async (name: string): Promise<any> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const inputs = async (): Promise<{
  map: BookMap;
  analyses: ChapterAnalysis[];
  deepReads: InterrogativeDeepRead[];
}> => {
  const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
  const analysis = ChapterAnalysisSchema.parse(await loadFixture("sample-chapter-analysis.json"));
  const first = analysis.claims[0]!;
  const second = analysis.claims[1]!;
  const firstAnalysis = ChapterAnalysisSchema.parse({
    ...analysis,
    chapterId: "chapter-micro-retrospective",
    title: "把复盘缩短到下一次行动之前",
    claims: [first],
    evidence: analysis.evidence.filter((item) => item.supportsClaimIds.includes(first.claimId)),
    quality: {confidence: 0.97, status: "PASS", blockingIssues: []},
  });
  const secondAnalysis = ChapterAnalysisSchema.parse({
    ...analysis,
    claims: [second],
    evidence: analysis.evidence.filter((item) => item.supportsClaimIds.includes(second.claimId)),
    quality: {confidence: 0.97, status: "PASS", blockingIssues: []},
  });
  const deepRead = InterrogativeDeepReadSchema.parse({
    chapterId: secondAnalysis.chapterId,
    originalClaims: [second].map((claim) => ({
      claimId: claim.claimId,
      statement: claim.statement,
      classification: "author_judgment",
      sourceRefs: claim.bookEvidenceRefs,
    })),
    revisedClaims: [{
      originalClaimId: second.claimId,
      statement: "合成统计只说明虚构样本内的关联，不能推广到真实人群。",
      reason: "Phase 3C 缩小了原主张范围。",
      sourceRefs: second.bookEvidenceRefs,
    }],
    evidenceLimits: [second].map((claim) => ({
      claimId: claim.claimId,
      proves: "只证明作者在书中提出该判断。",
      doesNotProve: "不能证明外部普遍有效。",
      sourceRefs: claim.bookEvidenceRefs,
    })),
    causalAssessment: [second].map((claim) => ({
      claimId: claim.claimId,
      status: "association_only",
      assessment: "现有证据不能建立因果关系。",
      sourceRefs: claim.bookEvidenceRefs,
    })),
    hiddenAssumptions: [],
    counterpoints: [{statement: "也可能存在其他解释。", sourceRefs: second.bookEvidenceRefs}],
    contradictions: [],
    scopeCorrections: [{
      claimId: second.claimId,
      correction: "仅限合成样本。",
      sourceRefs: second.bookEvidenceRefs,
    }],
    unresolvedQuestions: [],
    relationsToOtherChapters: [],
    finalJudgment: "核心方法有启发性，但统计不能外推。",
    confidence: 0.9,
    sourceRefs: second.bookEvidenceRefs,
  });
  return {map, analyses: [firstAnalysis, secondAnalysis], deepReads: [deepRead]};
};

const synthesisFor = (input: WholeBookSynthesisInput): WholeBookArgumentSynthesis => {
  const [first, second] = input.claims;
  return WholeBookArgumentSynthesisSchema.parse({
    coreThesis: [{
      statement: "云计算基础设施决定了企业利润增长。",
      confidence: 0.9,
      supportingClaimIds: [first!.claimId],
      perspective: "system_synthesis",
    }, {
      statement: first!.statement,
      confidence: 0.9,
      supportingClaimIds: [first!.claimId],
      perspective: "author_view",
    }],
    secondaryTheses: [{
      statement: "及时反馈可能强化复盘闭环，但证据范围有限。",
      confidence: 0.75,
      supportingClaimIds: [second!.claimId],
      perspective: "system_synthesis",
    }],
    argumentMap: [{
      statement: "作者以复盘定义为基础，再用反馈窗口补充条件。",
      perspective: "author_view",
      supportingClaimIds: [first!.claimId, second!.claimId],
    }],
    keyConcepts: [{concept: "行动反馈闭环", explanation: "复盘产生改动，反馈检验改动。", supportingClaimIds: [first!.claimId]}],
    crossChapterPatterns: [{statement: "定义与条件形成递进结构。", chapterIds: input.chapters.map((item) => item.chapterId), supportingClaimIds: [first!.claimId, second!.claimId]}],
    tensions: [{statement: "方法主张与合成统计的不可外推性存在张力。", perspective: "phase3c_critique", supportingClaimIds: [second!.claimId]}],
    limitations: [{statement: "统计来自合成样本，不能作为真实研究。", perspective: "phase3c_critique", supportingClaimIds: [second!.claimId]}],
    practicalFrameworks: [{name: "行动前微型复盘", steps: ["记录偏差", "形成改动", "下一轮检验"], supportingClaimIds: [first!.claimId]}],
    readerTakeaways: [{statement: "先把复盘变成可检验改动。", supportingClaimIds: [first!.claimId]}],
    relations: [
      {fromClaimId: first!.claimId, toClaimId: second!.claimId, relation: "supports"},
      {fromClaimId: second!.claimId, toClaimId: first!.claimId, relation: "qualifies"},
      {fromClaimId: first!.claimId, toClaimId: second!.claimId, relation: "explains"},
    ],
  });
};

class Provider implements WholeBookSynthesisProvider {
  readonly provider = "synthetic";
  readonly model = "synthetic-v1";
  calls: WholeBookSynthesisInput[] = [];
  async synthesize(input: WholeBookSynthesisInput): Promise<WholeBookArgumentSynthesis> {
    this.calls.push(structuredClone(input));
    return synthesisFor(input);
  }
}

describe("whole-book argument synthesis service", () => {
  it("calls the provider once, validates real Claim relations, persists output, and reuses cache", async () => {
    const directory = await mkdtemp(join(tmpdir(), "whole-book-synthesis-"));
    temporaryDirectories.push(directory);
    const {map, analyses, deepReads} = await inputs();
    const provider = new Provider();
    const outputPath = join(directory, "book-synthesis.json");
    const cachePath = join(directory, ".cache", "book-synthesis.json");

    const first = await createOrReuseWholeBookSynthesis({
      map, analyses, deepReads, outputPath, cachePath, provider,
      createdAt: "2026-08-13T00:00:00.000Z",
    });
    const second = await createOrReuseWholeBookSynthesis({
      map, analyses, deepReads, outputPath, cachePath, provider,
      createdAt: "2026-08-13T00:00:00.000Z",
    });

    expect(provider.calls).toHaveLength(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(first.blockingIssues).toEqual([]);
    expect(first.synthesis.coreThesis.map((item) => item.statement)).toEqual([
      provider.calls[0]!.claims[0]!.statement,
    ]);
    expect(first.synthesis.coreThesis[0]!.perspective).toBe("system_synthesis");
    expect(new Set(first.synthesis.relations.map((item) => item.relation)).size).toBe(3);
    expect(WholeBookArgumentSynthesisSchema.parse(JSON.parse(
      await readFile(outputPath, "utf8"),
    ))).toEqual(first.synthesis);
    expect(provider.calls[0]!.deepReads[0]!.scopeCorrections).toHaveLength(1);
  });

  it("blocks dangling thesis and relation Claim IDs instead of persisting them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "whole-book-synthesis-"));
    temporaryDirectories.push(directory);
    const {map, analyses, deepReads} = await inputs();
    const provider = new Provider();
    provider.synthesize = async (input) => {
      const output = synthesisFor(input);
      output.coreThesis[0]!.supportingClaimIds = ["claim-missing"];
      output.relations[0]!.toClaimId = "claim-missing";
      return output;
    };

    await expect(createOrReuseWholeBookSynthesis({
      map, analyses, deepReads,
      outputPath: join(directory, "book-synthesis.json"),
      cachePath: join(directory, ".cache", "book-synthesis.json"),
      provider,
    })).rejects.toThrow("MISSING_SYNTHESIS_CLAIM");
  });
});
