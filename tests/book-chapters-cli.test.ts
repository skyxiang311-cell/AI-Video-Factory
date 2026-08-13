import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {runBookChaptersCli} from "../scripts/book-chapters";
import type {
  ChapterDeepReadInput,
  ChapterDeepReadProvider,
} from "../src/research/book/chapter-deep-read-provider";
import {ChapterAnalysisSchema, type ChapterAnalysis} from "../src/research/book/knowledge-schema";

const originalWorkingDirectory = process.cwd();
const directory = resolve(".cache/book-chapters-cli-test");
const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const analysisFor = (input: ChapterDeepReadInput): ChapterAnalysis => {
  const block = input.blocks[0]!;
  const ref = {type: "book" as const, chapterId: input.chapterId, page: block.page, blockId: block.blockId};
  const suffix = input.chapterId.replace("chapter-", "");
  const claimId = `claim-${suffix}-specific`;
  return ChapterAnalysisSchema.parse({
    chapterId: input.chapterId,
    title: input.title,
    importance: {score: input.importance, level: "core", reason: input.targetReason},
    chapterRole: "core_argument",
    summary: {oneSentence: `${input.title}的独有摘要。`, detailed: `${input.title}的详细分析。`},
    claims: [{
      claimId,
      type: "mechanism",
      statement: `作者提出${input.title}的独有主张。`,
      importance: {score: 88, level: "core", reason: "核心主张。"},
      authorPosition: "作者明确主张，不是模型判断。",
      scope: {appliesTo: [`${input.title}界定的对象`], doesNotNecessarilyApplyTo: ["未被本章讨论的对象"]},
      bookEvidenceRefs: [ref],
      sourceRefs: [ref],
      confidence: 0.9,
      verificationStatus: "not_required",
    }],
    arguments: ["书内论证。"],
    evidence: [{
      evidenceId: `evidence-${suffix}-logical`, type: "logical_argument", summary: "书内逻辑。",
      supportsClaimIds: [claimId], strength: 0.7, sourceRef: ref,
      originalExcerpt: block.originalText, interpretation: "逻辑解释。", confidence: block.confidence,
    }, {
      evidenceId: `evidence-${suffix}-observation`, type: "author_observation", summary: "作者观察。",
      supportsClaimIds: [claimId], strength: 0.5, sourceRef: ref,
      originalExcerpt: block.originalText, interpretation: "观察不是外部验证。", confidence: block.confidence,
    }],
    concepts: ["独有概念"], examples: [], limitations: ["不推广到其他对象。"],
    questions: ["如何核验边界？"], relationsToOtherChapters: [], quality: {confidence: 0.9},
  });
};

class Provider implements ChapterDeepReadProvider {
  readonly provider = "synthetic";
  readonly model = "synthetic-v1";
  calls: string[] = [];
  async analyzeChapter(input: ChapterDeepReadInput): Promise<ChapterAnalysis> {
    this.calls.push(input.chapterId);
    return analysisFor(input);
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

describe("book:chapters CLI", () => {
  it("reads the current phase3BTargets and processes only those chapter ids", async () => {
    const source = await loadFixture("sample-book-source.json");
    const map = await loadFixture("sample-book-map.json") as {
      phase3BTargets: Array<{chapterId: string}>;
      chapters: Array<{chapterId: string; importance: number; sourceRefs: unknown[]}>;
    };
    const second = map.chapters[1]!;
    map.phase3BTargets = [{
      chapterId: second.chapterId,
      priority: second.importance,
      reason: "动态选择第二章进行深读。",
      sourceRefs: second.sourceRefs,
    } as never];
    const bookDirectory = resolve("output/dynamic-book/book");
    await mkdir(bookDirectory, {recursive: true});
    await writeFile(resolve(bookDirectory, "book-source.json"), JSON.stringify(source), "utf8");
    await writeFile(resolve(bookDirectory, "book-map.json"), JSON.stringify(map), "utf8");
    const provider = new Provider();
    const stdout: string[] = [];

    const exitCode = await runBookChaptersCli({
      argv: ["dynamic-book"],
      provider,
      stdout: (message) => stdout.push(message),
      stderr: () => undefined,
      createdAt: "2026-08-13T00:00:00.000Z",
    });

    expect(exitCode).toBe(0);
    expect(provider.calls).toEqual(["chapter-feedback-window"]);
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      jobId: "dynamic-book",
      chaptersProcessed: 1,
      chapterIds: ["chapter-feedback-window"],
      claimsPerChapter: {"chapter-feedback-window": 1},
      evidencePerChapter: {"chapter-feedback-window": 2},
      blockingTraceabilityIssues: [],
    });
  });

  it("returns a clear usage error without a job id", async () => {
    const stderr: string[] = [];
    expect(await runBookChaptersCli({argv: [], stderr: (message) => stderr.push(message)})).toBe(1);
    expect(stderr).toEqual(["Book chapters failed: Usage: npm run book:chapters -- <job-id>"]);
  });
});
