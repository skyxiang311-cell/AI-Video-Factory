import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {BookSourceSchema} from "../src/research/book/source-schema";

const validBookSource = () => ({
  artifact: {
    inputHash: "a".repeat(64),
    promptVersion: "book-source-v1",
    modelProfile: "balanced",
    schemaVersion: "1.0.0",
    createdAt: "2026-08-11T00:00:00.000Z",
  },
  metadata: {
    title: "测试之书",
    authors: ["作者"],
    language: "ja",
    publisher: "出版社",
    publicationYear: 2024,
    pageCount: 2,
  },
  document: {
    pdfKind: "digital",
    sourcePath: "input/book.pdf",
    sha256: "b".repeat(64),
    detectedLanguages: ["ja", "zh-CN"],
  },
  structure: {
    frontMatter: {startPage: 1, endPage: 1},
    chapters: [
      {chapterId: "chapter-intro", title: "导言", startPage: 1, endPage: 1},
      {chapterId: "chapter-method", title: "方法", startPage: 2, endPage: 2},
    ],
    conclusion: null,
    appendices: [],
  },
  pages: [
    {
      page: 1,
      contentBlocks: [
        {
          blockId: "p1-b1",
          page: 1,
          chapterId: "chapter-intro",
          type: "paragraph",
          originalText: "原文",
          language: "ja",
          translation: {"zh-CN": "中文解释"},
          bbox: [10, 20, 100, 120],
          confidence: 0.98,
        },
      ],
      visualElements: [],
    },
    {
      page: 2,
      contentBlocks: [
        {
          blockId: "p2-b1",
          page: 2,
          chapterId: "chapter-method",
          type: "heading",
          originalText: "方法",
          language: "ja",
          bbox: [10, 20, 100, 120],
          confidence: 0.97,
        },
      ],
      visualElements: [
        {
          elementId: "p2-v1",
          page: 2,
          type: "chart",
          bbox: [20, 200, 500, 600],
          description: "流程图",
          confidence: 0.9,
          assetPath: "visuals/p2-v1.png",
        },
      ],
    },
  ],
  extractionQuality: {
    overallConfidence: 0.95,
    lowConfidencePages: [],
    warnings: [],
  },
});

const expectInvalid = (input: unknown): void => {
  expect(BookSourceSchema.safeParse(input).success).toBe(false);
};

const expectInvalidPath = (input: unknown, expectedPath: string): void => {
  const result = BookSourceSchema.safeParse(input);

  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(expectedPath);
  }
};

const loadBookFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

describe("BookSourceSchema", () => {
  it("parses the synthetic two-page source fixture with high-confidence source blocks", async () => {
    const source = BookSourceSchema.parse(await loadBookFixture("sample-book-source.json"));

    expect(source.metadata.pageCount).toBe(2);
    expect(source.extractionQuality.overallConfidence).toBeGreaterThan(0.95);
    expect(source.pages).toHaveLength(2);
    expect(source.pages.flatMap((page) => page.contentBlocks).filter((block) => block.type === "paragraph"))
      .toHaveLength(2);
    expect(source.pages.flatMap((page) => page.visualElements).some((element) => element.type === "chart"))
      .toBe(true);
  });

  it("parses multilingual immutable original text with an optional translation", () => {
    const result = BookSourceSchema.parse(validBookSource());

    expect(result.pages[0]?.contentBlocks[0]).toMatchObject({
      originalText: "原文",
      language: "ja",
      translation: {"zh-CN": "中文解释"},
    });
  });

  it("rejects confidence outside the inclusive 0 to 1 range", () => {
    const source = validBookSource();
    source.pages[0]!.contentBlocks[0]!.confidence = 1.01;

    expectInvalid(source);
  });

  it("rejects a chapter whose end page is before its start page", () => {
    const source = validBookSource();
    source.structure.chapters[0]!.startPage = 2;
    source.structure.chapters[0]!.endPage = 1;

    expectInvalid(source);
  });

  it("rejects overlapping chapter ranges", () => {
    const source = validBookSource();
    source.structure.chapters[1]!.startPage = 1;

    expectInvalid(source);
  });

  it("rejects duplicate chapter ids", () => {
    const source = validBookSource();
    source.structure.chapters[1]!.chapterId = "chapter-intro";

    expectInvalidPath(source, "structure.chapters.1.chapterId");
  });

  it("rejects pages and structure ranges outside the document page count", () => {
    const source = validBookSource();
    source.pages[1]!.page = 3;

    expectInvalid(source);
  });

  it("rejects duplicate block ids", () => {
    const source = validBookSource();
    source.pages[0]!.contentBlocks.push({
      blockId: "p1-b1",
      page: 1,
      chapterId: "chapter-intro",
      type: "paragraph",
      originalText: "重复区块",
      language: "ja",
      translation: {"zh-CN": "重复中文解释"},
      bbox: [10, 20, 100, 120],
      confidence: 0.98,
    });

    expectInvalid(source);
  });

  it("rejects a block that cites a nonexistent chapter", () => {
    const source = validBookSource();
    source.pages[1]!.contentBlocks[0]!.chapterId = "chapter-missing";

    expectInvalid(source);
  });

  it("rejects a block outside its cited chapter range", () => {
    const source = validBookSource();
    source.pages[1]!.contentBlocks[0]!.chapterId = "chapter-intro";

    expectInvalid(source);
  });

  it("requires a complete unique page set from one through page count", () => {
    const source = validBookSource();
    source.pages.pop();

    expectInvalid(source);
  });

  it("preserves a safe book-relative visual crop path", () => {
    const source = BookSourceSchema.parse(validBookSource());

    expect(source.pages[1]?.visualElements[0]?.assetPath).toBe("visuals/p2-v1.png");
    expect(source.pages[1]?.visualElements[0]?.page).toBe(2);
  });

  it("rejects a visual page that differs from its containing PDF page", () => {
    const source = validBookSource();
    source.pages[1]!.visualElements[0]!.page = 1;

    expectInvalidPath(source, "pages.1.visualElements.0.page");
  });

  it("rejects unsafe visual crop paths", () => {
    const source = validBookSource();
    source.pages[1]!.visualElements[0]!.assetPath = "../p2-v1.png";

    expectInvalidPath(source, "pages.1.visualElements.0.assetPath");
  });

  it("requires a visual crop path to match its element id", () => {
    const source = validBookSource();
    source.pages[1]!.visualElements[0]!.assetPath = "visuals/p2-v2.png";

    expectInvalidPath(source, "pages.1.visualElements.0.assetPath");
  });

  it("rejects duplicate visual element ids", () => {
    const source = validBookSource();
    const visualElements = source.pages[1]!.visualElements as Array<{
      elementId: string;
      page: number;
      type: string;
      bbox: number[];
      description: string;
      confidence: number;
      assetPath: string;
    }>;
    visualElements.push({
      ...visualElements[0]!,
      bbox: [10, 10, 20, 20],
    });

    expectInvalidPath(source, "pages.1.visualElements.1.elementId");
  });
});
