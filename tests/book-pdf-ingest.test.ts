import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {
  detectChineseChapterBoundaries,
  detectBookTextLanguage,
  type ExtractedLine,
  ingestDigitalPdf,
} from "../src/research/book/pdf-ingest";
import {BookSourceSchema} from "../src/research/book/source-schema";

const fixturePath = fileURLToPath(new URL("./fixtures/digital-book.pdf", import.meta.url));
const textlessFixturePath = fileURLToPath(new URL("./fixtures/textless-book.pdf", import.meta.url));

const extractedLine = (
  page: number,
  text: string,
  y: number,
  height = 9.5,
): ExtractedLine => ({
  page,
  text,
  bbox: [60, y, 300, height],
  confidence: 0.99,
});

describe("digital PDF book ingest", () => {
  it("confirms Chinese chapter starts in body text and merges split titles", () => {
    const lines = [
      extractedLine(2, "目录", 550),
      extractedLine(2, "第一章中国社会分层概述 ........ 1", 520),
      extractedLine(2, "第二章 中国社会分层结构的特征 ........ 15", 500),
      extractedLine(3, "第二十四章 中国社会学界关于社会分层的研究 ........ 502", 520),
      extractedLine(4, "第二十四章是文献梳理，不是正文标题。", 400),
      extractedLine(5, "第一章", 544, 14),
      extractedLine(5, "中国社会分层概述", 526, 14),
      extractedLine(10, "第二章 中国社会分层结构的特征", 544),
      extractedLine(20, "第二十四章中国社会学界关于社会分层的研究", 544, 14),
    ];

    expect(detectChineseChapterBoundaries(lines)).toEqual([
      {chapterNumber: 1, title: "第一章 中国社会分层概述", startPage: 5},
      {chapterNumber: 2, title: "第二章 中国社会分层结构的特征", startPage: 10},
      {
        chapterNumber: 24,
        title: "第二十四章 中国社会学界关于社会分层的研究",
        startPage: 20,
      },
    ]);
  });

  it("merges a chapter title that continues across two lines after the marker", () => {
    const lines = [
      extractedLine(203, "第十章", 544, 14),
      extractedLine(203, "从“倒丁字型”向“土字型”", 526, 14),
      extractedLine(203, "社会结构的变迁", 508, 14),
      extractedLine(203, "第九章介绍了社会分层的测量方法。", 407),
    ];

    expect(detectChineseChapterBoundaries(lines)).toEqual([{
      chapterNumber: 10,
      title: "第十章 从“倒丁字型”向“土字型” 社会结构的变迁",
      startPage: 203,
    }]);
  });

  it("extracts true pages and stable source blocks into the BookSource contract", async () => {
    const source = await ingestDigitalPdf(fixturePath, {
      createdAt: "2026-08-12T00:00:00.000Z",
    });

    expect(BookSourceSchema.parse(source)).toEqual(source);
    expect(source.metadata).toMatchObject({
      title: "Phase 2A Test Book",
      authors: ["Codex Fixture"],
      language: "en",
      pageCount: 2,
    });
    expect(source.document).toMatchObject({
      pdfKind: "digital",
      sourcePath: fixturePath,
      detectedLanguages: ["en"],
    });
    expect(source.pages.map((page) => page.page)).toEqual([1, 2]);
    expect(source.pages[0]?.contentBlocks.map((block) => block.originalText).join(" "))
      .toBe("Chapter 1 Digital PDF ingestion keeps page numbers.");
    expect(source.pages[1]?.contentBlocks.map((block) => block.originalText).join(" "))
      .toBe("Page Two Stable blocks preserve original text.");

    const blocks = source.pages.flatMap((page) => page.contentBlocks);
    expect(blocks).toHaveLength(4);
    expect(new Set(blocks.map((block) => block.blockId)).size).toBe(blocks.length);
    expect(blocks.every((block) => block.blockId.startsWith(`p${block.page}-`))).toBe(true);
    expect(blocks.every((block) => block.confidence >= 0.99)).toBe(true);
    expect(blocks.every((block) => block.translation === undefined)).toBe(true);
    expect(source.extractionQuality.warnings.every((warning) => (
      !warning.includes("local OCR")
    ))).toBe(true);

    const chapters = new Map(source.structure.chapters.map((chapter) => [chapter.chapterId, chapter]));
    expect(source.structure.chapters).toEqual([
      {chapterId: "chapter-001", title: "Chapter 1", startPage: 1, endPage: 2},
    ]);
    expect(blocks.every((block) => {
      const chapter = chapters.get(block.chapterId);
      return chapter !== undefined
        && block.page >= chapter.startPage
        && block.page <= chapter.endPage;
    })).toBe(true);
  });

  it("hashes the original PDF bytes with SHA-256", async () => {
    const source = await ingestDigitalPdf(fixturePath);
    const expected = createHash("sha256").update(await readFile(fixturePath)).digest("hex");

    expect(source.document.sha256).toBe(expected);
    expect(source.artifact.inputHash).toBe(expected);
  });

  it("uses OCR fallback without inventing content for a textless PDF", async () => {
    const source = await ingestDigitalPdf(textlessFixturePath);

    expect(source.document.pdfKind).toBe("scanned");
    expect(source.pages.flatMap((page) => page.contentBlocks)).toEqual([]);
    expect(source.extractionQuality.lowConfidencePages).toContainEqual({
      page: 1,
      confidence: 0,
      reason: expect.stringContaining("local OCR"),
    });
  });

  it("uses a warning-backed fallback container when no chapter boundary is reliable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-pdf-fallback-"));
    const fallbackPath = join(directory, "fallback.pdf");
    try {
      const fixture = await readFile(fixturePath);
      await writeFile(fallbackPath, Buffer.from(
        fixture.toString("latin1").replace("Chapter 1", "Overview "),
        "latin1",
      ));

      const source = await ingestDigitalPdf(fallbackPath);

      expect(source.structure.chapters).toEqual([{
        chapterId: "chapter-001",
        title: "Phase 2A Test Book",
        startPage: 1,
        endPage: 2,
      }]);
      expect(source.extractionQuality.warnings).toContain(
        "No reliable chapter boundaries were detected; using one fallback container for the full document",
      );
    } finally {
      await rm(directory, {force: true, recursive: true});
    }
  });

  it.each([
    ["中文段落", "zh-CN"],
    ["日本語の文章", "ja"],
    ["English paragraph", "en"],
    ["123?!", "und"],
  ] as const)("detects the initial language for %s", (text, expected) => {
    expect(detectBookTextLanguage(text)).toBe(expected);
  });
});
