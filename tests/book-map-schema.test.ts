import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {BookMapSchema} from "../src/research/book/book-map-schema";

const loadFixture = async (): Promise<unknown> => JSON.parse(
  await readFile(
    new URL("../templates/book-deep-reading/sample-book-map.json", import.meta.url),
    "utf8",
  ),
);

describe("BookMapSchema", () => {
  it("parses the synthetic Simplified Chinese whole-book map", async () => {
    const map = BookMapSchema.parse(await loadFixture());

    expect(map.analysisLanguage).toBe("zh-CN");
    expect(map.chapters).toHaveLength(2);
    expect(map.chapters.map((chapter) => chapter.importance)).toEqual([92, 74]);
    expect(map.phase3BTargets[0]?.chapterId).toBe("chapter-micro-retrospective");
  });

  it("rejects chapter importance outside 0 through 100", async () => {
    const map = await loadFixture() as {chapters: Array<{importance: number}>};
    map.chapters[0]!.importance = 101;

    expect(BookMapSchema.safeParse(map).success).toBe(false);
  });

  it("rejects duplicate mapped chapter ids", async () => {
    const map = await loadFixture() as {chapters: Array<{chapterId: string}>};
    map.chapters[1]!.chapterId = map.chapters[0]!.chapterId;

    const result = BookMapSchema.safeParse(map);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join(".")))
        .toContain("chapters.1.chapterId");
    }
  });

  it("requires Simplified Chinese as the declared analysis language", async () => {
    const map = await loadFixture() as {analysisLanguage: string};
    map.analysisLanguage = "en";

    expect(BookMapSchema.safeParse(map).success).toBe(false);
  });

  it("allows a structurally retained chapter to declare insufficient evidence", async () => {
    const map = await loadFixture() as {
      chapters: Array<{
        analysisStatus: string;
        role: string;
        summary: string;
        importance: number;
        deepReadPriority: string;
        sourceRefs: unknown[];
      }>;
    };
    map.chapters[1] = {
      ...map.chapters[1]!,
      analysisStatus: "insufficient_evidence",
      role: "证据不足，未判断章节作用。",
      summary: "本章文字因低置信度被排除，未进行内容判断。",
      importance: 0,
      deepReadPriority: "low",
      sourceRefs: [],
    };

    expect(BookMapSchema.safeParse(map).success).toBe(true);
  });

  it("rejects an analyzed chapter without source references", async () => {
    const map = await loadFixture() as {chapters: Array<{sourceRefs: unknown[]}>};
    map.chapters[0]!.sourceRefs = [];

    expect(BookMapSchema.safeParse(map).success).toBe(false);
  });
});
