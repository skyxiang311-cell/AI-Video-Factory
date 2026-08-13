import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {runBookDeepReadCli} from "../scripts/book-deep-read";
import type {
  InterrogativeDeepReadInput,
  InterrogativeDeepReadProvider,
} from "../src/research/book/interrogative-deep-read-provider";
import type {InterrogativeDeepReadDraft} from "../src/research/book/interrogative-deep-read-schema";

const originalWorkingDirectory = process.cwd();
const directory = resolve(".cache/book-deep-read-cli-test");
const loadFixture = async (name: string): Promise<any> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

class Provider implements InterrogativeDeepReadProvider {
  readonly provider = "synthetic";
  readonly model = "synthetic-v1";
  calls: string[] = [];
  async analyzeChapter(input: InterrogativeDeepReadInput): Promise<InterrogativeDeepReadDraft> {
    this.calls.push(input.chapterId);
    const claim = input.analysis.claims[0]!;
    const ref = claim.bookEvidenceRefs[0]!;
    return {
      claimAssessments: [{claimId: claim.claimId, classification: "author_judgment", sourceRefs: [ref]}],
      revisedClaims: [],
      evidenceLimits: [{claimId: claim.claimId, proves: "证明作者陈述。", doesNotProve: "不证明普遍性。", sourceRefs: [ref]}],
      causalAssessment: [{claimId: claim.claimId, status: "not_applicable", assessment: "无因果主张。", sourceRefs: [ref]}],
      hiddenAssumptions: [], counterpoints: [], contradictions: [], scopeCorrections: [],
      unresolvedQuestions: [{question: "边界是什么？", sourceRefs: [ref]}], relationsToOtherChapters: [],
      finalJudgment: "保留范围边界。", confidence: 0.9, sourceRefs: [ref],
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

describe("book:deep-read CLI", () => {
  it("reads existing PASS chapters and reports exactly three dynamically selected outputs", async () => {
    const source = await loadFixture("sample-book-source.json");
    const map = await loadFixture("sample-book-map.json");
    const baseChapter = JSON.parse(await readFile(
      new URL("../templates/book-deep-reading/sample-chapter-analysis.json", import.meta.url),
      "utf8",
    ));
    const chapters = [
      {chapterId: "chapter-a", importance: 80},
      {chapterId: "chapter-b", importance: 95},
      {chapterId: "chapter-c", importance: 90},
    ];
    source.metadata.pageCount = 3;
    source.structure.chapters = chapters.map((chapter, index) => ({
      chapterId: chapter.chapterId, title: chapter.chapterId, startPage: index + 1, endPage: index + 1,
    }));
    source.pages = chapters.map((chapter, index) => ({
      page: index + 1,
      contentBlocks: [{
        blockId: `p${index + 1}-b1`, page: index + 1, chapterId: chapter.chapterId,
        type: "paragraph", originalText: `${chapter.chapterId}真实原文。`, language: "zh-CN",
        bbox: [0, 0, 10, 10], confidence: 0.99,
      }],
      visualElements: [],
    }));
    map.chapters = chapters.map((chapter, index) => ({
      chapterId: chapter.chapterId, title: chapter.chapterId,
      startPage: index + 1, endPage: index + 1, analysisStatus: "analyzed",
      role: "角色", summary: "摘要", importance: chapter.importance, deepReadPriority: "high",
      sourceRefs: [{type: "book", chapterId: chapter.chapterId, page: index + 1, blockId: `p${index + 1}-b1`}],
    }));
    map.phase3BTargets = chapters.map((chapter, index) => ({
      chapterId: chapter.chapterId, priority: chapter.importance, reason: "深读",
      sourceRefs: [{type: "book", chapterId: chapter.chapterId, page: index + 1, blockId: `p${index + 1}-b1`}],
    }));
    const bookDirectory = resolve("output/sample/book");
    await mkdir(resolve(bookDirectory, "chapters"), {recursive: true});
    await writeFile(resolve(bookDirectory, "book-source.json"), JSON.stringify(source));
    await writeFile(resolve(bookDirectory, "book-map.json"), JSON.stringify(map));
    for (const [index, chapter] of chapters.entries()) {
      const ref = {type: "book", chapterId: chapter.chapterId, page: index + 1, blockId: `p${index + 1}-b1`};
      const claimId = `claim-${chapter.chapterId.replace("chapter-", "")}-core`;
      await writeFile(resolve(bookDirectory, "chapters", `${chapter.chapterId}.json`), JSON.stringify({
        ...baseChapter, chapterId: chapter.chapterId, title: chapter.chapterId,
        importance: {score: chapter.importance, level: "core", reason: "核心"},
        claims: [{...baseChapter.claims[0], claimId, statement: `${chapter.chapterId}真实原文。`,
          bookEvidenceRefs: [ref], sourceRefs: [ref]}],
        evidence: [{...baseChapter.evidence[0], evidenceId: `evidence-${chapter.chapterId.replace("chapter-", "")}-core`,
          summary: `${chapter.chapterId}真实原文。`, supportsClaimIds: [claimId], sourceRef: ref,
          originalExcerpt: `${chapter.chapterId}真实原文。`}],
        quality: {confidence: 0.9, status: "PASS", blockingIssues: []},
      }));
    }
    const provider = new Provider();
    const stdout: string[] = [];

    const exitCode = await runBookDeepReadCli({
      argv: ["sample"], provider, stdout: (message) => stdout.push(message), stderr: () => undefined,
      createdAt: "2026-08-13T00:00:00.000Z",
    });

    expect(exitCode).toBe(0);
    expect(provider.calls).toEqual(["chapter-b", "chapter-c", "chapter-a"]);
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      jobId: "sample", selectedChapters: ["chapter-b", "chapter-c", "chapter-a"],
      blockingIssues: [],
    });
  });

  it("returns a concise usage error without a job id", async () => {
    const stderr: string[] = [];
    expect(await runBookDeepReadCli({argv: [], stderr: (message) => stderr.push(message)})).toBe(1);
    expect(stderr).toEqual(["Book deep-read failed: Usage: npm run book:deep-read -- <job-id>"]);
  });
});
