import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {BookSourceSchema} from "../src/research/book/source-schema";
import {
  IndependentAuditSchema,
  type IndependentAuditDraft,
} from "../src/research/book/independent-audit-schema";
import type {IndependentAuditProvider} from "../src/research/book/independent-audit-provider";
import {createOrReuseIndependentAudit} from "../src/research/book/independent-audit-service";
import {WholeBookArgumentSynthesisSchema} from "../src/research/book/whole-book-argument-synthesis-schema";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const draft = (claimId: string): IndependentAuditDraft => ({
  coverageScore: 88,
  thesisScore: 90,
  evidenceScore: 86,
  scopeScore: 87,
  causalityScore: 85,
  synthesisScore: 89,
  traceabilityScore: 92,
  blockingIssues: [],
  warnings: [{code: "LIMITED_DEEP_READ", artifact: "deep-read/", claimIds: [], message: "仅部分章节完成质疑式二读。"}],
  strengths: [{code: "TRACEABLE_CORE", artifact: "book-synthesis.json", claimIds: [claimId], message: "核心命题可回溯到真实 Claim。"}],
  requiredRepairs: [{code: "EXPAND_DEEP_READ", artifact: "deep-read/", claimIds: [], action: "后续按排序扩展质疑式二读覆盖。"}],
});

class Provider implements IndependentAuditProvider {
  readonly provider = "synthetic";
  readonly model = "auditor-v1";
  calls = 0;
  constructor(private readonly output: IndependentAuditDraft) {}
  async audit(): Promise<IndependentAuditDraft> {
    this.calls += 1;
    return structuredClone(this.output);
  }
}

const makeInputs = async () => {
  const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
  const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
  const analysisFixture = await loadFixture("sample-chapter-analysis.json") as Record<string, unknown>;
  const analysis = ChapterAnalysisSchema.parse({
    ...analysisFixture,
    quality: {confidence: 0.97, status: "PASS", blockingIssues: []},
  });
  const [first, second] = analysis.claims;
  const synthesis = WholeBookArgumentSynthesisSchema.parse({
    coreThesis: [{statement: first!.statement, confidence: 0.9, supportingClaimIds: [first!.claimId], perspective: "system_synthesis"}],
    secondaryTheses: [{statement: second!.statement, confidence: 0.8, supportingClaimIds: [second!.claimId], perspective: "system_synthesis"}],
    argumentMap: [{statement: "两项主张形成跨章结构。", perspective: "author_view", supportingClaimIds: [first!.claimId, second!.claimId]}],
    keyConcepts: [{concept: "反馈", explanation: "反馈限制行动结论。", supportingClaimIds: [first!.claimId]}],
    crossChapterPatterns: [{statement: "定义与限制互相补充。", chapterIds: map.chapters.map((chapter) => chapter.chapterId), supportingClaimIds: [first!.claimId, second!.claimId]}],
    tensions: [{statement: "方法价值与证据边界存在张力。", perspective: "phase3c_critique", supportingClaimIds: [second!.claimId]}],
    limitations: [{statement: "不能外推。", perspective: "phase3c_critique", supportingClaimIds: [second!.claimId]}],
    practicalFrameworks: [],
    readerTakeaways: [{statement: "保留范围限制。", supportingClaimIds: [second!.claimId]}],
    relations: [
      {fromClaimId: first!.claimId, toClaimId: second!.claimId, relation: "supports"},
      {fromClaimId: second!.claimId, toClaimId: first!.claimId, relation: "qualifies"},
      {fromClaimId: first!.claimId, toClaimId: second!.claimId, relation: "explains"},
    ],
  });
  return {source, map, analyses: [analysis], deepReads: [], synthesis, claimId: first!.claimId};
};

describe("independent audit service", () => {
  it("calls the auditor once, applies the score rule, writes audit.json, and reuses cache", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-audit-"));
    temporaryDirectories.push(directory);
    const inputs = await makeInputs();
    const provider = new Provider(draft(inputs.claimId));
    const options = {
      ...inputs,
      outputPath: join(directory, "audit.json"),
      cachePath: join(directory, ".cache", "audit.json"),
      provider,
      createdAt: "2026-08-13T00:00:00.000Z",
    };

    const first = await createOrReuseIndependentAudit(options);
    const second = await createOrReuseIndependentAudit(options);

    expect(provider.calls).toBe(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(first.audit.overallScore).toBe(88);
    expect(first.audit.status).toBe("PASS");
    expect(first.audit.videoReady).toBe(true);
    expect(IndependentAuditSchema.parse(JSON.parse(await readFile(options.outputPath, "utf8")))).toEqual(first.audit);
  });

  it("forces BLOCKED when the synthesis or auditor references an unknown Claim", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-audit-"));
    temporaryDirectories.push(directory);
    const inputs = await makeInputs();
    const output = draft(inputs.claimId);
    output.strengths[0]!.claimIds = ["claim-missing"];
    inputs.synthesis.coreThesis[0]!.supportingClaimIds = ["claim-missing"];
    const result = await createOrReuseIndependentAudit({
      ...inputs,
      outputPath: join(directory, "audit.json"),
      cachePath: join(directory, ".cache", "audit.json"),
      provider: new Provider(output),
    });

    expect(result.audit.status).toBe("BLOCKED");
    expect(result.audit.videoReady).toBe(false);
    expect(result.audit.blockingIssues.map((issue) => issue.code)).toContain("DANGLING_CLAIM_REF");
    expect(result.audit.requiredRepairs.some((repair) => repair.claimIds.includes("claim-missing"))).toBe(true);
  });

  it("normalizes Claim-only findings to concrete chapter artifact paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-audit-"));
    temporaryDirectories.push(directory);
    const inputs = await makeInputs();
    const output = draft(inputs.claimId);
    output.blockingIssues.push({code: "SCOPE_BLOCK", artifact: inputs.claimId, claimIds: [inputs.claimId], message: "范围大于原 Claim。"});
    const result = await createOrReuseIndependentAudit({
      ...inputs,
      outputPath: join(directory, "audit.json"),
      cachePath: join(directory, ".cache", "audit.json"),
      provider: new Provider(output),
    });
    expect(result.audit.blockingIssues[0]!.artifact).toBe("chapters/chapter-feedback-window.json");
  });

  it("suppresses universality and causal-proof false positives for deterministically validated extractive observations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-audit-"));
    temporaryDirectories.push(directory);
    const inputs = await makeInputs();
    const analysis = structuredClone(inputs.analyses[0]!);
    const sourceBlock = inputs.source.pages[0]!.contentBlocks.find((block) => (
      block.blockId === "p1-bmicro-retrospective"
    ))!;
    const claim = analysis.claims[0]!;
    claim.claimId = "claim-micro-retrospective-extractive";
    claim.type = "author_observation";
    claim.statement = sourceBlock.originalText;
    claim.evidenceSupport = "strong";
    claim.scope.appliesTo = [sourceBlock.originalText];
    claim.scope.doesNotNecessarilyApplyTo = ["原文未明确覆盖的其他时期、地区或群体"];
    analysis.evidence = [{
      ...analysis.evidence[0]!,
      supportsClaimIds: [claim.claimId],
      summary: sourceBlock.originalText,
      originalExcerpt: sourceBlock.originalText,
    }];
    analysis.claims = [claim, analysis.claims[1]!];
    analysis.evidence.push(inputs.analyses[0]!.evidence[1]!);
    inputs.synthesis = JSON.parse(
      JSON.stringify(inputs.synthesis).replaceAll(inputs.claimId, claim.claimId),
    );
    const output = draft(claim.claimId);
    output.blockingIssues = [{
      code: "FALSE_UNIVERSALITY_BLOCK",
      artifact: "chapters/chapter-micro-retrospective.json",
      claimIds: [claim.claimId],
      message: "没有解释因果，也没有外部数据证明准确性或普遍性。",
    }];
    output.requiredRepairs = [{
      code: "FALSE_UNIVERSALITY_REPAIR",
      artifact: "chapters/chapter-micro-retrospective.json",
      claimIds: [claim.claimId],
      action: "补充原文不存在的因果或普遍性证据。",
    }];

    const result = await createOrReuseIndependentAudit({
      ...inputs,
      analyses: [analysis],
      outputPath: join(directory, "audit.json"),
      cachePath: join(directory, ".cache", "audit.json"),
      provider: new Provider(output),
    });

    expect(result.audit.blockingIssues).toEqual([]);
    expect(result.audit.requiredRepairs).toEqual([]);
    expect(result.audit.status).toBe("PASS");
    expect(result.audit.videoReady).toBe(true);
  });

  it("deterministically blocks an extractive Claim that exceeds its real source block", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-audit-"));
    temporaryDirectories.push(directory);
    const inputs = await makeInputs();
    const analysis = structuredClone(inputs.analyses[0]!);
    const claim = analysis.claims[0]!;
    claim.claimId = "claim-micro-retrospective-extractive";
    claim.type = "author_observation";
    claim.statement = `${analysis.evidence[0]!.originalExcerpt} 因而必然适用于所有社会。`;
    claim.evidenceSupport = "strong";
    claim.scope.doesNotNecessarilyApplyTo = ["原文未明确覆盖的其他时期、地区或群体"];
    analysis.evidence[0]!.supportsClaimIds = [claim.claimId];
    analysis.claims = [claim, analysis.claims[1]!];
    inputs.synthesis = JSON.parse(
      JSON.stringify(inputs.synthesis).replaceAll(inputs.claimId, claim.claimId),
    );
    const output = draft(claim.claimId);

    const result = await createOrReuseIndependentAudit({
      ...inputs,
      analyses: [analysis],
      outputPath: join(directory, "audit.json"),
      cachePath: join(directory, ".cache", "audit.json"),
      provider: new Provider(output),
    });

    expect(result.audit.status).toBe("BLOCKED");
    expect(result.audit.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "INVALID_EXTRACTIVE_CLAIM", claimIds: [claim.claimId]}),
    ]));
  });
});
