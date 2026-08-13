import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {BookMapSchema, type BookMap} from "../src/research/book/book-map-schema";
import type {
  InterrogativeDeepReadInput,
  InterrogativeDeepReadProvider,
} from "../src/research/book/interrogative-deep-read-provider";
import {
  createOrReuseInterrogativeDeepReads,
} from "../src/research/book/interrogative-deep-read-service";
import {
  InterrogativeDeepReadSchema,
  type InterrogativeDeepReadDraft,
} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema, type ChapterAnalysis} from "../src/research/book/knowledge-schema";
import {BookSourceSchema, type BookSource} from "../src/research/book/source-schema";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, {force: true, recursive: true})
  )));
});

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const makeInputs = async (): Promise<{
  source: BookSource;
  map: BookMap;
  analyses: ChapterAnalysis[];
}> => {
  const source = structuredClone(await loadFixture("sample-book-source.json")) as Record<string, any>;
  const map = structuredClone(await loadFixture("sample-book-map.json")) as Record<string, any>;
  const chapters = [
    {chapterId: "chapter-a", title: "甲章", importance: 70},
    {chapterId: "chapter-b", title: "乙章", importance: 95},
    {chapterId: "chapter-c", title: "丙章", importance: 85},
    {chapterId: "chapter-d", title: "丁章", importance: 90},
  ];
  source.metadata.pageCount = chapters.length;
  source.structure.chapters = chapters.map((chapter, index) => ({
    chapterId: chapter.chapterId,
    title: chapter.title,
    startPage: index + 1,
    endPage: index + 1,
  }));
  source.pages = chapters.map((chapter, index) => ({
    page: index + 1,
    contentBlocks: [{
      blockId: `p${index + 1}-b1`,
      page: index + 1,
      chapterId: chapter.chapterId,
      type: "paragraph",
      originalText: `${chapter.title}的作者原文明确限定了本章判断的适用范围。`,
      language: "zh-CN",
      bbox: [0, 0, 100, 100],
      confidence: 0.99,
    }],
    visualElements: [],
  }));
  map.chapters = chapters.map((chapter, index) => ({
    chapterId: chapter.chapterId,
    title: chapter.title,
    startPage: index + 1,
    endPage: index + 1,
    analysisStatus: "analyzed",
    role: `${chapter.title}在全书中的作用。`,
    summary: `${chapter.title}的独有摘要。`,
    importance: chapter.importance,
    deepReadPriority: chapter.importance >= 90 ? "high" : "medium",
    sourceRefs: [{
      type: "book",
      chapterId: chapter.chapterId,
      page: index + 1,
      blockId: `p${index + 1}-b1`,
    }],
  }));
  map.phase3BTargets = [chapters[0]!, chapters[2]!, chapters[1]!, chapters[3]!].map((chapter) => ({
    chapterId: chapter.chapterId,
    priority: chapter.importance,
    reason: `${chapter.title}需要进一步深读。`,
    sourceRefs: map.chapters.find((item: any) => item.chapterId === chapter.chapterId)!.sourceRefs,
  }));

  const parsedSource = BookSourceSchema.parse(source);
  const parsedMap = BookMapSchema.parse(map);
  const analyses = chapters.map((chapter, index) => {
    const ref = {
      type: "book" as const,
      chapterId: chapter.chapterId,
      page: index + 1,
      blockId: `p${index + 1}-b1`,
    };
    const claimId = `claim-${chapter.chapterId.replace("chapter-", "")}-core`;
    return ChapterAnalysisSchema.parse({
      chapterId: chapter.chapterId,
      title: chapter.title,
      importance: {score: chapter.importance, level: "core", reason: "全书重要章节。"},
      chapterRole: "core_argument",
      summary: {oneSentence: `${chapter.title}摘要。`, detailed: `${chapter.title}详细摘要。`},
      claims: [{
        claimId,
        type: "author_judgment",
        statement: parsedSource.pages[index]!.contentBlocks[0]!.originalText,
        importance: {score: chapter.importance, level: "core", reason: "核心主张。"},
        authorPosition: "作者明确判断。",
        scope: {appliesTo: [`${chapter.title}明确范围`], doesNotNecessarilyApplyTo: ["其他未讨论范围"]},
        bookEvidenceRefs: [ref],
        sourceRefs: [ref],
        confidence: 0.9,
        verificationStatus: "not_required",
        evidenceSupport: "strong",
      }],
      arguments: [],
      evidence: [{
        evidenceId: `evidence-${chapter.chapterId.replace("chapter-", "")}-core`,
        type: "author_observation",
        summary: parsedSource.pages[index]!.contentBlocks[0]!.originalText,
        supportsClaimIds: [claimId],
        strength: 0.8,
        sourceRef: ref,
        originalExcerpt: parsedSource.pages[index]!.contentBlocks[0]!.originalText,
        interpretation: "作者原文。",
        confidence: 0.99,
      }],
      concepts: [], examples: [], limitations: [], questions: [], relationsToOtherChapters: [],
      quality: {confidence: 0.9, status: "PASS", blockingIssues: []},
    });
  });
  return {source: parsedSource, map: parsedMap, analyses};
};

class Provider implements InterrogativeDeepReadProvider {
  readonly provider = "synthetic";
  readonly model = "synthetic-reread-v1";
  calls: string[] = [];

  async analyzeChapter(input: InterrogativeDeepReadInput): Promise<InterrogativeDeepReadDraft> {
    this.calls.push(input.chapterId);
    const claim = input.analysis.claims[0]!;
    const ref = claim.bookEvidenceRefs[0]!;
    const related = input.comparisonChapters.find((item) => item.chapterId !== input.chapterId)!;
    return {
      claimAssessments: [{claimId: claim.claimId, classification: "author_judgment", sourceRefs: [ref]}],
      revisedClaims: [{
        originalClaimId: claim.claimId,
        statement: `${claim.statement}（仅限原文明确范围）`,
        reason: "原主张需要显式保留范围限制。",
        sourceRefs: [ref],
      }],
      evidenceLimits: [{
        claimId: claim.claimId,
        proves: "原文能证明作者作出该判断。",
        doesNotProve: "不能证明该判断普遍适用。",
        sourceRefs: [ref],
      }],
      causalAssessment: [{
        claimId: claim.claimId,
        status: "not_applicable",
        assessment: "原 Claim 没有提出因果关系。",
        sourceRefs: [ref],
      }],
      hiddenAssumptions: [{statement: "作者假定所述范围稳定。", sourceRefs: [ref]}],
      counterpoints: [{statement: "原文没有排除其他解释。", sourceRefs: [ref]}],
      contradictions: [{
        relatedChapterId: related.chapterId,
        statement: "两章对适用范围的侧重点存在张力。",
        sourceRefs: [ref, related.claims[0]!.sourceRefs[0]!],
      }],
      scopeCorrections: [{
        claimId: claim.claimId,
        correction: "只适用于原文明确讨论的范围。",
        sourceRefs: [ref],
      }],
      unresolvedQuestions: [{question: "该判断能否推广？", sourceRefs: [ref]}],
      relationsToOtherChapters: [{
        relatedChapterId: related.chapterId,
        relation: "提供对照范围。",
        sourceRefs: [ref, related.claims[0]!.sourceRefs[0]!],
      }],
      finalJudgment: "该章主张具有解释价值，但必须保留证据和范围边界。",
      confidence: 0.88,
      sourceRefs: [ref],
    };
  }
}

describe("interrogative core chapter reread service", () => {
  it("selects the top three PASS targets by importance, calls each once, and reuses chapter caches", async () => {
    const directory = await mkdtemp(join(tmpdir(), "interrogative-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map, analyses} = await makeInputs();
    const provider = new Provider();

    const first = await createOrReuseInterrogativeDeepReads({
      source, map, analyses, deepReadDirectory: directory, provider,
      createdAt: "2026-08-13T00:00:00.000Z",
    });
    const second = await createOrReuseInterrogativeDeepReads({
      source, map, analyses, deepReadDirectory: directory, provider,
      createdAt: "2026-08-13T00:00:00.000Z",
    });

    expect(first.selectedChapters).toEqual(["chapter-b", "chapter-d", "chapter-c"]);
    expect(provider.calls).toEqual(["chapter-b", "chapter-d", "chapter-c"]);
    expect(first.cacheHits).toEqual({"chapter-b": false, "chapter-d": false, "chapter-c": false});
    expect(second.cacheHits).toEqual({"chapter-b": true, "chapter-d": true, "chapter-c": true});
    expect(first.blockingIssues).toEqual([]);
    for (const chapterId of first.selectedChapters) {
      const output = InterrogativeDeepReadSchema.parse(JSON.parse(
        await readFile(join(directory, `${chapterId}.json`), "utf8"),
      ));
      expect(output.chapterId).toBe(chapterId);
      expect(output.originalClaims).toHaveLength(1);
      expect(output.sourceRefs[0]).toMatchObject({type: "book", chapterId});
    }
  });

  it("blocks a provider sourceRef that was not supplied from real PASS artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "interrogative-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map, analyses} = await makeInputs();
    const provider = new Provider();
    const original = provider.analyzeChapter.bind(provider);
    provider.analyzeChapter = async (input) => {
      const draft = await original(input);
      draft.sourceRefs = [{type: "book", chapterId: input.chapterId, page: 999, blockId: "p999-b1"}];
      return draft;
    };

    await expect(createOrReuseInterrogativeDeepReads({
      source, map, analyses, deepReadDirectory: directory, provider,
    })).rejects.toThrow("UNKNOWN_SOURCE_REF");
  });
});
