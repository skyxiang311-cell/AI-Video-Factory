import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {
  ingestDigitalPdf,
  isReliableNativeText,
} from "../src/research/book/pdf-ingest";
import {BookSourceSchema} from "../src/research/book/source-schema";

const fixturePath = fileURLToPath(new URL("./fixtures/scanned-book.pdf", import.meta.url));
const createdAt = "2026-08-12T00:00:00.000Z";

describe("scanned PDF book ingest", () => {
  it("uses local OCR per page and preserves true pages without inventing blank text", async () => {
    const source = await ingestDigitalPdf(fixturePath, {createdAt});

    expect(BookSourceSchema.parse(source)).toEqual(source);
    expect(source.metadata.pageCount).toBe(2);
    expect(source.document.pdfKind).toBe("scanned");
    expect(source.pages.map((page) => page.page)).toEqual([1, 2]);
    expect(source.pages[0]?.contentBlocks.length).toBeGreaterThan(0);
    expect(source.pages[1]?.contentBlocks).toEqual([]);
    expect(source.extractionQuality.lowConfidencePages).toContainEqual({
      page: 2,
      confidence: 0,
      reason: expect.stringContaining("local OCR"),
    });
    expect(source.extractionQuality.warnings.some((warning) => (
      warning.includes("page 2")
    ))).toBe(true);

    const blocks = source.pages.flatMap((page) => page.contentBlocks);
    const text = blocks.map((block) => block.originalText).join(" ");
    expect(text).toContain("Chapter 1");
    expect(text).toMatch(/\p{Script=Han}/u);
    expect(text).toMatch(/[\u3040-\u30ff]/u);
    expect(new Set(blocks.map((block) => block.blockId)).size).toBe(blocks.length);
    expect(blocks.every((block) => (
      block.blockId.startsWith(`p${block.page}-`)
      && block.confidence >= 0.5
      && block.confidence <= 1
    ))).toBe(true);

    const chapters = new Map(source.structure.chapters.map((chapter) => [chapter.chapterId, chapter]));
    expect(blocks.every((block) => {
      const chapter = chapters.get(block.chapterId);
      return chapter !== undefined
        && block.page >= chapter.startPage
        && block.page <= chapter.endPage;
    })).toBe(true);
  }, 60_000);

  it("produces stable OCR pages and block identifiers across runs", async () => {
    const first = await ingestDigitalPdf(fixturePath, {createdAt});
    const second = await ingestDigitalPdf(fixturePath, {createdAt});

    expect(second.pages).toEqual(first.pages);
    expect(second.extractionQuality).toEqual(first.extractionQuality);
  }, 60_000);

  it.each([
    {text: "Book", expected: true},
    {text: "本", expected: false},
    {text: "Book\uFFFD", expected: false},
  ])("classifies native text reliability for $text", ({text, expected}) => {
    expect(isReliableNativeText([{page: 1, text, bbox: [0, 0, 1, 1]}])).toBe(expected);
  });
});
