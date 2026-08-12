import {readFile, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {
  deriveBookIngestJobId,
  runBookIngestCli,
} from "../scripts/book-ingest";
import {BookSourceSchema} from "../src/research/book/source-schema";

const fixturePath = fileURLToPath(new URL("./fixtures/digital-book.pdf", import.meta.url));
const scannedFixturePath = fileURLToPath(new URL("./fixtures/scanned-book.pdf", import.meta.url));
const complexFixturePath = fileURLToPath(
  new URL("./fixtures/complex-visual-book.pdf", import.meta.url),
);
const originalWorkingDirectory = process.cwd();
let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "book-ingest-cli-"));
  process.chdir(temporaryDirectory);
});

afterEach(async () => {
  process.chdir(originalWorkingDirectory);
  await rm(temporaryDirectory, {force: true, recursive: true});
});

describe("book ingest CLI", () => {
  it("persists a Schema-valid digital PDF source to the canonical job path", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runBookIngestCli({
      argv: [fixturePath],
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const outputPath = resolve("output/digital-book/book/book-source.json");
    const persisted = BookSourceSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    const summary = JSON.parse(stdout.join("\n")) as Record<string, unknown>;

    expect(persisted.metadata.pageCount).toBe(2);
    expect(persisted.pages.flatMap((page) => page.contentBlocks)).toHaveLength(4);
    expect(summary).toEqual({
      jobId: "digital-book",
      outputPath,
      pageCount: 2,
      blockCount: 4,
      visualElementCount: 0,
    });
  });

  it("persists a Schema-valid scanned PDF source after local OCR", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runBookIngestCli({
      argv: [scannedFixturePath],
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const outputPath = resolve("output/scanned-book/book/book-source.json");
    const persisted = BookSourceSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    const summary = JSON.parse(stdout.join("\n")) as Record<string, unknown>;
    const blockCount = persisted.pages.flatMap((page) => page.contentBlocks).length;

    expect(persisted.document.pdfKind).toBe("scanned");
    expect(persisted.pages.map((page) => page.page)).toEqual([1, 2]);
    expect(persisted.pages[1]?.contentBlocks).toEqual([]);
    expect(summary).toEqual({
      jobId: "scanned-book",
      outputPath,
      pageCount: 2,
      blockCount,
      visualElementCount: 0,
    });
  }, 60_000);

  it("persists complex PDF visual crops beside the Schema-valid source", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runBookIngestCli({
      argv: [complexFixturePath],
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const outputPath = resolve("output/complex-visual-book/book/book-source.json");
    const persisted = BookSourceSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    const elements = persisted.pages.flatMap((page) => page.visualElements);
    const blockCount = persisted.pages.flatMap((page) => page.contentBlocks).length;
    const summary = JSON.parse(stdout.join("\n")) as Record<string, unknown>;

    expect(elements).toHaveLength(4);
    for (const element of elements) {
      const png = await readFile(resolve("output/complex-visual-book/book", element.assetPath!));
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    }
    expect(summary).toEqual({
      jobId: "complex-visual-book",
      outputPath,
      pageCount: 1,
      blockCount,
      visualElementCount: 4,
    });
  });

  it.each([
    {argv: [], error: "Usage: npm run book:ingest -- <pdf-path>"},
    {argv: ["notes.txt"], error: "Input must be a .pdf file"},
  ])("returns failure without writing output for invalid arguments", async ({argv, error}) => {
    const stderr: string[] = [];

    const exitCode = await runBookIngestCli({
      argv,
      stdout: () => undefined,
      stderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(1);
    expect(stderr).toEqual([`Book ingest failed: ${error}`]);
    await expect(readFile(resolve("output/digital-book/book/book-source.json"), "utf8"))
      .rejects.toMatchObject({code: "ENOENT"});
  });

  it("derives a deterministic safe job id from the PDF filename", () => {
    expect(deriveBookIngestJobId("/books/My Deep-Read 2026.pdf")).toBe("my-deep-read-2026");
    expect(() => deriveBookIngestJobId("/books/中文.pdf")).toThrow(
      "PDF filename must contain a safe job id",
    );
  });
});
