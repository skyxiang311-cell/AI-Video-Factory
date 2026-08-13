import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {runBookSynthesizeCli} from "../scripts/book-synthesize";
import {InterrogativeDeepReadSchema} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import type {WholeBookArgumentSynthesis} from "../src/research/book/whole-book-argument-synthesis-schema";
import type {WholeBookSynthesisInput, WholeBookSynthesisProvider} from "../src/research/book/whole-book-synthesis-provider";

const originalWorkingDirectory = process.cwd();
const directory = resolve(".cache/book-synthesize-cli-test");
const loadFixture = async (name: string): Promise<any> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

class Provider implements WholeBookSynthesisProvider {
  readonly provider = "synthetic";
  readonly model = "synthetic-v1";
  calls = 0;
  async synthesize(input: WholeBookSynthesisInput): Promise<WholeBookArgumentSynthesis> {
    this.calls += 1;
    const [first, second] = input.claims;
    return {
      coreThesis: [{statement: first!.statement, confidence: 0.9, supportingClaimIds: [first!.claimId], perspective: "system_synthesis"}],
      secondaryTheses: [],
      argumentMap: [{statement: "跨章论证。", perspective: "author_view", supportingClaimIds: [first!.claimId, second!.claimId]}],
      keyConcepts: [{concept: "反馈", explanation: "反馈检验改动。", supportingClaimIds: [first!.claimId]}],
      crossChapterPatterns: [{statement: "跨章模式。", chapterIds: input.chapters.map((item) => item.chapterId), supportingClaimIds: [first!.claimId, second!.claimId]}],
      tensions: [{statement: "证据存在张力。", perspective: "phase3c_critique", supportingClaimIds: [second!.claimId]}],
      limitations: [{statement: "证据不可外推。", perspective: "phase3c_critique", supportingClaimIds: [second!.claimId]}],
      practicalFrameworks: [],
      readerTakeaways: [{statement: "保留边界。", supportingClaimIds: [second!.claimId]}],
      relations: [
        {fromClaimId: first!.claimId, toClaimId: second!.claimId, relation: "supports"},
        {fromClaimId: second!.claimId, toClaimId: first!.claimId, relation: "qualifies"},
        {fromClaimId: first!.claimId, toClaimId: second!.claimId, relation: "explains"},
      ],
    };
  }
}

beforeEach(async () => {
  await rm(directory, {force: true, recursive: true});
  await mkdir(directory, {recursive: true});
  process.chdir(directory);
});

afterEach(async () => {
  process.chdir(originalWorkingDirectory);
  await rm(directory, {force: true, recursive: true});
});

describe("book:synthesize CLI", () => {
  it("reads existing map, PASS chapters and deep-reads, then makes one synthesis call", async () => {
    const map = await loadFixture("sample-book-map.json");
    const raw = ChapterAnalysisSchema.parse(await loadFixture("sample-chapter-analysis.json"));
    const firstClaim = raw.claims[0]!;
    const secondClaim = raw.claims[1]!;
    const analyses = [
      ChapterAnalysisSchema.parse({
        ...raw, chapterId: "chapter-micro-retrospective", title: "微型复盘",
        claims: [firstClaim], evidence: raw.evidence.filter((item) => item.supportsClaimIds.includes(firstClaim.claimId)),
        quality: {confidence: 0.9, status: "PASS", blockingIssues: []},
      }),
      ChapterAnalysisSchema.parse({
        ...raw, claims: [secondClaim], evidence: raw.evidence.filter((item) => item.supportsClaimIds.includes(secondClaim.claimId)),
        quality: {confidence: 0.9, status: "PASS", blockingIssues: []},
      }),
    ];
    const deepRead = InterrogativeDeepReadSchema.parse({
      chapterId: analyses[1]!.chapterId,
      originalClaims: [{claimId: secondClaim.claimId, statement: secondClaim.statement, classification: "author_judgment", sourceRefs: secondClaim.bookEvidenceRefs}],
      revisedClaims: [],
      evidenceLimits: [{claimId: secondClaim.claimId, proves: "证明作者陈述。", doesNotProve: "不证明普遍性。", sourceRefs: secondClaim.bookEvidenceRefs}],
      causalAssessment: [{claimId: secondClaim.claimId, status: "association_only", assessment: "只能说明关联。", sourceRefs: secondClaim.bookEvidenceRefs}],
      hiddenAssumptions: [], counterpoints: [], contradictions: [],
      scopeCorrections: [{claimId: secondClaim.claimId, correction: "仅限合成样本。", sourceRefs: secondClaim.bookEvidenceRefs}],
      unresolvedQuestions: [], relationsToOtherChapters: [], finalJudgment: "不可外推。",
      confidence: 0.9, sourceRefs: secondClaim.bookEvidenceRefs,
    });
    const bookDirectory = resolve("output/sample/book");
    await mkdir(resolve(bookDirectory, "chapters"), {recursive: true});
    await mkdir(resolve(bookDirectory, "deep-read"), {recursive: true});
    await writeFile(resolve(bookDirectory, "book-map.json"), JSON.stringify(map));
    for (const analysis of analyses) {
      await writeFile(resolve(bookDirectory, "chapters", `${analysis.chapterId}.json`), JSON.stringify(analysis));
    }
    await writeFile(resolve(bookDirectory, "deep-read", `${deepRead.chapterId}.json`), JSON.stringify(deepRead));
    const provider = new Provider();
    const stdout: string[] = [];

    const exitCode = await runBookSynthesizeCli({
      argv: ["sample"], provider, stdout: (message) => stdout.push(message), stderr: () => undefined,
      createdAt: "2026-08-13T00:00:00.000Z",
    });

    expect(exitCode).toBe(0);
    expect(provider.calls).toBe(1);
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      jobId: "sample", cacheHit: false, supportingClaimsCount: 1,
      relationTypes: ["supports", "qualifies", "explains"],
      tensionsCount: 1, limitationsCount: 1, blockingIssues: [],
    });
    expect(JSON.parse(await readFile(resolve(bookDirectory, "book-synthesis.json"), "utf8")))
      .toHaveProperty("coreThesis");
  });

  it("returns a concise usage error without a job id", async () => {
    const stderr: string[] = [];
    expect(await runBookSynthesizeCli({argv: [], stderr: (message) => stderr.push(message)})).toBe(1);
    expect(stderr).toEqual(["Book synthesis failed: Usage: npm run book:synthesize -- <job-id>"]);
  });
});
