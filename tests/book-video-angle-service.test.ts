import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import type {BookVideoAngleInput, BookVideoAngleProvider} from "../src/research/book/book-video-angle-provider";
import {createOrReuseBookVideoAngles} from "../src/research/book/book-video-angle-service";
import {BookSelectedAngleSchema, BookVideoAnglesSchema} from "../src/research/book/book-video-angle-schema";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {WholeBookArgumentSynthesisSchema} from "../src/research/book/whole-book-argument-synthesis-schema";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => (
  rm(directory, {recursive: true, force: true})
))));

const loadFixture = async (name: string): Promise<any> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const inputs = async () => {
  const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
  const raw = ChapterAnalysisSchema.parse(await loadFixture("sample-chapter-analysis.json"));
  const analyses = [ChapterAnalysisSchema.parse({
    ...raw,
    quality: {confidence: 0.95, status: "PASS", blockingIssues: []},
    evidence: raw.evidence.map((item) => ({...item, strength: 0.9})),
    claims: raw.claims.map((claim) => ({
      ...claim,
      verificationStatus: "not_required",
      evidenceSupport: "strong",
    })),
  })];
  const claimIds = analyses[0]!.claims.map((claim) => claim.claimId);
  const synthesis = WholeBookArgumentSynthesisSchema.parse({
    coreThesis: [{statement: analyses[0]!.claims[0]!.statement, confidence: 0.9, supportingClaimIds: [claimIds[0]], perspective: "system_synthesis"}],
    secondaryTheses: [],
    argumentMap: [{statement: "作者提出方法并限定证据范围。", perspective: "author_view", supportingClaimIds: claimIds}],
    keyConcepts: [{concept: "复盘", explanation: "把偏差变成下一次行动。", supportingClaimIds: [claimIds[0]]}],
    crossChapterPatterns: [{statement: "定义与证据限制共同构成方法边界。", chapterIds: [analyses[0]!.chapterId, "chapter-micro-retrospective"], supportingClaimIds: claimIds}],
    tensions: [{statement: "统计不能外推。", perspective: "phase3c_critique", supportingClaimIds: [claimIds[1]]}],
    limitations: [{statement: "只适用于书内样本。", perspective: "phase3c_critique", supportingClaimIds: [claimIds[1]]}],
    practicalFrameworks: [],
    readerTakeaways: [{statement: "保留适用边界。", supportingClaimIds: [claimIds[0]]}],
    relations: [
      {fromClaimId: claimIds[0], toClaimId: claimIds[1], relation: "supports"},
      {fromClaimId: claimIds[1], toClaimId: claimIds[0], relation: "qualifies"},
      {fromClaimId: claimIds[0], toClaimId: claimIds[1], relation: "explains"},
    ],
  });
  return {
    map,
    synthesis,
    audit: {videoReady: true, blockingIssues: []},
    analyses,
    deepReads: [],
  };
};

const candidateFor = (input: BookVideoAngleInput, index: number, question?: string) => ({
  angleId: `angle-${String(index).padStart(2, "0")}`,
  title: `微型复盘为什么要让反馈赶在下一次行动前${"甲乙丙丁戊己庚辛壬癸"[index]}`,
  centralQuestion: question ?? `为什么微型复盘需要让反馈赶在下一次行动前${"甲乙丙丁戊己庚辛壬癸"[index]}？`,
  thesis: "每次行动后的微型复盘，只有让具体反馈在下一次行动前到达，并把偏差变成下一轮可检验的调整，才可能积累可纠正的学习线索。",
  coreClaimIds: input.claims.slice(0, 2).map((claim) => claim.claimId),
  evidenceIds: input.claims.slice(0, 2).flatMap((claim) => claim.evidence.map((item) => item.evidenceId)).slice(0, 2),
  sourceRefs: input.claims.slice(0, 2).flatMap((claim) => claim.sourceRefs).slice(0, 2),
  angleType: "hidden_mechanism" as const,
  audienceRelevance: 88 - index,
  practicalValue: 90 - index,
  counterIntuitiveScore: 82 - index,
  evidenceStrength: 91 - index,
  narrativePotential: 89 - index,
  saveValue: 87 - index,
  originalInsight: 86 - index,
  titleIntegrityScore: 94,
  faithfulnessPenalty: 0,
  overclaimPenalty: 0,
  evidencePenalty: 0,
  overallScore: 1,
  eligible: true,
  reason: "两个独立 Claim 与直接 Evidence 共同支持。",
  risks: ["只能在书中研究语境内表达。"],
});

class Provider implements BookVideoAngleProvider {
  readonly provider = "synthetic";
  readonly model = "synthetic-v1";
  calls: BookVideoAngleInput[] = [];
  async generateAngles(input: BookVideoAngleInput, _issues?: string[]) {
    this.calls.push(structuredClone(input));
    return {candidates: Array.from({length: 9}, (_, index) => candidateFor(
      input,
      index,
      index === 8 ? "为什么微型复盘需要让反馈赶在下一次行动前甲？" : undefined,
    ))};
  }
}

describe("Book video angle service", () => {
  it("blocks before provider invocation when the independent audit is not video-ready", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-angles-"));
    temporaryDirectories.push(directory);
    const options = await inputs();
    const provider = new Provider();

    await expect(createOrReuseBookVideoAngles({
      ...options,
      audit: {videoReady: false, blockingIssues: [{code: "BLOCK", artifact: "audit.json", claimIds: [], message: "blocked"}]},
      provider,
      outputPath: join(directory, "video-angles.json"),
      selectedPath: join(directory, "selected-angle.json"),
      cachePath: join(directory, ".cache", "video-angles.json"),
    })).rejects.toThrow("AUDIT_NOT_VIDEO_READY");
    expect(provider.calls).toHaveLength(0);
  });

  it("calls once, rejects duplicates, keeps the top eligible 3-5, selects #1, and reuses cache", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-angles-"));
    temporaryDirectories.push(directory);
    const options = await inputs();
    const provider = new Provider();
    const run = () => createOrReuseBookVideoAngles({
      ...options,
      provider,
      outputPath: join(directory, "video-angles.json"),
      selectedPath: join(directory, "selected-angle.json"),
      cachePath: join(directory, ".cache", "video-angles.json"),
      createdAt: "2026-08-14T00:00:00.000Z",
    });

    const first = await run();
    const second = await run();

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.supportBundles.some((bundle) => bundle.claimIds.length >= 2)).toBe(true);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(first.angles.candidates).toHaveLength(5);
    expect(first.angles.candidates.every((item) => item.eligible)).toBe(true);
    expect(first.angles.candidates[0]!.overallScore).toBeGreaterThan(first.angles.candidates[4]!.overallScore);
    expect(first.selected.angleId).toBe(first.angles.candidates[0]!.angleId);
    expect(first.selected.targetDurationSec).toBe(300);
    expect(new Set(first.selected.coreClaimIds).size).toBeGreaterThanOrEqual(2);
    expect(BookVideoAnglesSchema.parse(JSON.parse(await readFile(join(directory, "video-angles.json"), "utf8"))))
      .toEqual(first.angles);
    expect(BookSelectedAngleSchema.parse(JSON.parse(await readFile(join(directory, "selected-angle.json"), "utf8"))))
      .toEqual(first.selected);
  });

  it("does not make a dangling or unverified candidate eligible", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-angles-"));
    temporaryDirectories.push(directory);
    const options = await inputs();
    const provider = new Provider();
    provider.generateAngles = async (input) => ({
      candidates: Array.from({length: 8}, (_, index) => index === 0 ? {
        ...candidateFor(input, index),
        coreClaimIds: [input.claims[0]!.claimId, "claim-missing"],
      } : candidateFor(input, index)),
    });

    const result = await createOrReuseBookVideoAngles({
      ...options, provider,
      outputPath: join(directory, "video-angles.json"),
      selectedPath: join(directory, "selected-angle.json"),
      cachePath: join(directory, ".cache", "video-angles.json"),
    });

    expect(result.angles.candidates.some((item) => item.coreClaimIds.includes("claim-missing"))).toBe(false);
  });

  it("derives evidence strength from the real Evidence instead of trusting a mis-scaled model score", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-angles-"));
    temporaryDirectories.push(directory);
    const options = await inputs();
    const provider = new Provider();
    provider.generateAngles = async (input) => ({
      candidates: Array.from({length: 8}, (_, index) => ({
        ...candidateFor(input, index),
        evidenceStrength: 0,
      })),
    });

    const result = await createOrReuseBookVideoAngles({
      ...options, provider,
      outputPath: join(directory, "video-angles.json"),
      selectedPath: join(directory, "selected-angle.json"),
      cachePath: join(directory, ".cache", "video-angles.json"),
    });

    expect(result.angles.candidates).toHaveLength(5);
    expect(result.angles.candidates.every((item) => item.evidenceStrength >= 65)).toBe(true);
  });

  it("drops a title and thesis that introduce a topic absent from the linked Claim Evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-angles-"));
    temporaryDirectories.push(directory);
    const options = await inputs();
    const provider = new Provider();
    provider.generateAngles = async (input) => ({
      candidates: Array.from({length: 8}, (_, index) => index === 0 ? {
        ...candidateFor(input, index),
        title: "城市化为什么必然改变中产阶层？",
        centralQuestion: "城市化为什么必然改变中产阶层？",
        thesis: "城市化必然决定中产阶层的形成。",
      } : candidateFor(input, index)),
    });

    const result = await createOrReuseBookVideoAngles({
      ...options, provider,
      outputPath: join(directory, "video-angles.json"),
      selectedPath: join(directory, "selected-angle.json"),
      cachePath: join(directory, ".cache", "video-angles.json"),
    });

    expect(result.angles.candidates.some((item) => item.title.includes("城市化"))).toBe(false);
  });

  it("drops a candidate when one of its two nominal support Claims is unrelated", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-angles-"));
    temporaryDirectories.push(directory);
    const options = await inputs();
    const analysis = options.analyses[0]!;
    const unrelatedClaim = structuredClone(analysis.claims[1]!);
    unrelatedClaim.claimId = "claim-unrelated-housing";
    unrelatedClaim.statement = "作者只讨论另一情境中的住房产权登记。";
    unrelatedClaim.bookEvidenceRefs = [analysis.evidence[1]!.sourceRef as any];
    unrelatedClaim.sourceRefs = [...unrelatedClaim.bookEvidenceRefs];
    const unrelatedEvidence = structuredClone(analysis.evidence[1]!);
    unrelatedEvidence.evidenceId = "evidence-unrelated-housing";
    unrelatedEvidence.summary = "另一情境的住房产权登记。";
    unrelatedEvidence.originalExcerpt = "住房产权登记。";
    unrelatedEvidence.supportsClaimIds = [unrelatedClaim.claimId];
    analysis.claims.push(unrelatedClaim);
    analysis.evidence.push(unrelatedEvidence);
    const provider = new Provider();
    provider.generateAngles = async (input) => ({
      candidates: Array.from({length: 8}, (_, index) => index === 0 ? {
        ...candidateFor(input, index),
        coreClaimIds: [input.claims[0]!.claimId, unrelatedClaim.claimId],
        evidenceIds: [input.claims[0]!.evidence[0]!.evidenceId, unrelatedEvidence.evidenceId],
        sourceRefs: [input.claims[0]!.sourceRefs[0]!, unrelatedClaim.bookEvidenceRefs[0]!],
      } : candidateFor(input, index)),
    });

    const result = await createOrReuseBookVideoAngles({
      ...options, provider,
      outputPath: join(directory, "video-angles.json"),
      selectedPath: join(directory, "selected-angle.json"),
      cachePath: join(directory, ".cache", "video-angles.json"),
    });

    expect(result.angles.candidates.some((item) => item.coreClaimIds.includes(unrelatedClaim.claimId))).toBe(false);
  });

  it("feeds deterministic rejection reasons back once when fewer than three angles survive", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-angles-"));
    temporaryDirectories.push(directory);
    const options = await inputs();
    const provider = new Provider();
    const feedback: Array<string[] | undefined> = [];
    provider.generateAngles = async (input, issues) => {
      feedback.push(issues);
      return {candidates: Array.from({length: 8}, (_, index) => ({
        ...candidateFor(input, index),
        centralQuestion: issues ? candidateFor(input, index).centralQuestion : "这不是一个问句",
      }))};
    };

    const result = await createOrReuseBookVideoAngles({
      ...options, provider,
      outputPath: join(directory, "video-angles.json"),
      selectedPath: join(directory, "selected-angle.json"),
      cachePath: join(directory, ".cache", "video-angles.json"),
    });

    expect(feedback).toHaveLength(2);
    expect(feedback[1]?.join(" ")).toContain("CENTRAL_QUESTION_NOT_A_QUESTION");
    expect(result.angles.candidates).toHaveLength(5);
  });
});
