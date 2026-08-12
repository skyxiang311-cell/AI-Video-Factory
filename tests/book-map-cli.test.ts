import {mkdir, readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {runBookMapCli} from "../scripts/book-map";
import {BookMapSchema, type BookMap} from "../src/research/book/book-map-schema";
import type {BookMapProvider} from "../src/research/book/book-map-provider";
import type {
  MiniChapterEvidence,
  MiniChapterMap,
  WholeBookSynthesis,
  WholeBookSynthesisInput,
} from "../src/research/book/book-map-stages";

const originalWorkingDirectory = process.cwd();
const testDirectory = resolve(".cache/book-map-cli-test");

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

class CliSyntheticProvider implements BookMapProvider {
  readonly provider = "synthetic-provider";
  readonly model = "synthetic-book-map-v1";
  chapterCalls: MiniChapterEvidence[] = [];
  synthesisCalls: WholeBookSynthesisInput[] = [];
  constructor(private readonly fixture: BookMap) {}
  async analyzeChapter(input: MiniChapterEvidence): Promise<MiniChapterMap> {
    this.chapterCalls.push(input);
    const chapter = this.fixture.chapters.find((item) => item.chapterId === input.chapterId)!;
    return {
      analysisStatus: chapter.analysisStatus,
      chapterId: chapter.chapterId,
      title: chapter.title,
      role: chapter.role,
      oneSentenceSummary: chapter.summary,
      keyConcepts: ["行动反馈"],
      candidateTheses: ["候选命题需要验证。"],
      importance: chapter.importance,
      deepReadPriority: chapter.deepReadPriority,
      sourceRefs: chapter.sourceRefs,
      analysisConfidence: 0.8,
    };
  }
  async synthesize(input: WholeBookSynthesisInput): Promise<WholeBookSynthesis> {
    this.synthesisCalls.push(input);
    return {
      analysisLanguage: "zh-CN",
      coreProblem: this.fixture.coreProblem,
      candidateCoreTheses: this.fixture.candidateCoreTheses,
      structureOverview: this.fixture.structureOverview,
      recurringConcepts: this.fixture.recurringConcepts,
      chapterImportanceRanking: this.fixture.chapters.map((chapter) => ({
        chapterId: chapter.chapterId,
        importance: chapter.importance,
        deepReadPriority: chapter.deepReadPriority,
        reason: "通过全书比较确定。",
      })),
      phase3BTargets: this.fixture.phase3BTargets,
      warnings: this.fixture.warnings,
    };
  }
}

beforeEach(async () => {
  await import("node:fs/promises").then(({rm}) => rm(testDirectory, {
    force: true,
    recursive: true,
  }));
  await mkdir(testDirectory, {recursive: true});
  process.chdir(testDirectory);
});

afterEach(async () => {
  process.chdir(originalWorkingDirectory);
  await import("node:fs/promises").then(({rm}) => rm(testDirectory, {
    force: true,
    recursive: true,
  }));
});

describe("book:map CLI", () => {
  it("analyzes the synthetic source once and persists the canonical Book Map", async () => {
    const source = await loadFixture("sample-book-source.json");
    const mapFixture = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
    const provider = new CliSyntheticProvider(mapFixture);
    const sourcePath = resolve("output/synthetic-book/book/book-source.json");
    await mkdir(resolve("output/synthetic-book/book"), {recursive: true});
    await writeFile(sourcePath, JSON.stringify(source), "utf8");
    const stdout: string[] = [];
    const stderr: string[] = [];

    const firstExitCode = await runBookMapCli({
      argv: ["synthetic-book"],
      provider,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
      createdAt: "2026-08-12T00:00:00.000Z",
    });
    const secondExitCode = await runBookMapCli({
      argv: ["synthetic-book"],
      provider,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
      createdAt: "2026-08-12T01:00:00.000Z",
    });

    expect(firstExitCode).toBe(0);
    expect(secondExitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(provider.chapterCalls).toHaveLength(2);
    expect(provider.synthesisCalls).toHaveLength(1);
    const outputPath = resolve("output/synthetic-book/book/book-map.json");
    const persisted = BookMapSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(persisted.analysisLanguage).toBe("zh-CN");
    expect(persisted.chapters).toHaveLength(2);
    expect(JSON.parse(stdout[0]!) as Record<string, unknown>).toEqual({
      jobId: "synthetic-book",
      outputPath,
      provider: "synthetic-provider",
      model: "synthetic-book-map-v1",
      chaptersAnalyzed: 2,
      cacheHit: false,
    });
    expect(JSON.parse(stdout[1]!) as Record<string, unknown>).toMatchObject({
      cacheHit: true,
      chaptersAnalyzed: 2,
    });
  });

  it("returns a clear failure for missing arguments", async () => {
    const stderr: string[] = [];

    const exitCode = await runBookMapCli({
      argv: [],
      stdout: () => undefined,
      stderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(1);
    expect(stderr).toEqual([
      "Book map failed: Usage: npm run book:map -- <job-id>",
    ]);
  });
});
