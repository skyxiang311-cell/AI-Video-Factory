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
          type: "chart",
          bbox: [20, 200, 500, 600],
          description: "流程图",
          confidence: 0.9,
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

describe("BookSourceSchema", () => {
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

  it("rejects pages and structure ranges outside the document page count", () => {
    const source = validBookSource();
    source.pages[1]!.page = 3;

    expectInvalid(source);
  });
});
