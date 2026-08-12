import {mkdir, readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {runBookMapCli} from "../scripts/book-map";
import {BookMapSchema, type BookMapDraft} from "../src/research/book/book-map-schema";
import type {BookMapEvidencePack} from "../src/research/book/book-map-input";
import type {BookMapProvider} from "../src/research/book/book-map-provider";

const originalWorkingDirectory = process.cwd();
const testDirectory = resolve(".cache/book-map-cli-test");

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

class CliSyntheticProvider implements BookMapProvider {
  readonly provider = "synthetic-provider";
  readonly model = "synthetic-book-map-v1";
  calls: BookMapEvidencePack[] = [];
  constructor(private readonly draft: BookMapDraft) {}
  async analyze(input: BookMapEvidencePack): Promise<BookMapDraft> {
    this.calls.push(input);
    return structuredClone(this.draft);
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
    const {artifact: _artifact, provider: _provider, ...draft} = mapFixture;
    const provider = new CliSyntheticProvider(draft);
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
    expect(provider.calls).toHaveLength(1);
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
