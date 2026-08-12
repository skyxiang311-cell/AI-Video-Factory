import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {BookMapSchema, type BookMap} from "../src/research/book/book-map-schema";
import {
  buildBookMapEvidencePack,
  validateBookMapAgainstSource,
} from "../src/research/book/book-map-input";
import {BookSourceSchema, type BookSource} from "../src/research/book/source-schema";

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const loadSource = async (): Promise<BookSource> => BookSourceSchema.parse(
  await loadFixture("sample-book-source.json"),
);

const loadMap = async (): Promise<BookMap> => BookMapSchema.parse(
  await loadFixture("sample-book-map.json"),
);

describe("Book Map evidence and traceability", () => {
  it("keeps front matter out of the formal chapters sent to Book Map", async () => {
    const source = await loadSource();
    source.structure.frontMatter = {startPage: 1, endPage: 1};
    source.structure.chapters[0] = {
      chapterId: "chapter-front-matter",
      title: "Front Matter",
      startPage: 1,
      endPage: 1,
    };
    source.pages[0]!.contentBlocks = source.pages[0]!.contentBlocks.map((block) => ({
      ...block,
      chapterId: "chapter-front-matter",
    }));
    const parsed = BookSourceSchema.parse(source);

    const pack = buildBookMapEvidencePack(parsed);

    expect(pack.structure.chapters.map((chapter) => chapter.chapterId)).toEqual([
      "chapter-feedback-window",
    ]);
    expect(pack.chapters.map((chapter) => chapter.chapterId)).toEqual([
      "chapter-feedback-window",
    ]);
    expect(pack.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.chapterId)))
      .not.toContain("chapter-front-matter");
  });

  it("excludes low-confidence pages and blocks from the provider evidence pack", async () => {
    const source = await loadSource();
    source.pages[0]!.contentBlocks.push({
      ...source.pages[0]!.contentBlocks[0]!,
      blockId: "p1-blow-confidence",
      originalText: "这段低置信度文字不得发送给模型。",
      confidence: 0.84,
    });
    source.extractionQuality.lowConfidencePages = [{
      page: 2,
      confidence: 0.4,
      reason: "synthetic low-confidence OCR page",
    }];

    const pack = buildBookMapEvidencePack(source);
    const blocks = pack.chapters.flatMap((chapter) => chapter.blocks);

    expect(blocks.map((block) => block.blockId)).toEqual(["p1-bmicro-retrospective"]);
    expect(JSON.stringify(pack)).not.toContain("这段低置信度文字不得发送给模型");
    expect(JSON.stringify(pack)).not.toContain("p2-bfeedback-window");
    expect(pack.chapters[1]?.blocks).toEqual([]);
    expect(pack.excludedLowConfidencePages).toEqual([{
      page: 2,
      reason: "synthetic low-confidence OCR page",
    }]);
  });

  it("accepts a complete map whose references resolve to eligible source blocks", async () => {
    expect(validateBookMapAgainstSource(await loadSource(), await loadMap())).toEqual([]);
  });

  it("blocks dangling and low-confidence source references", async () => {
    const source = await loadSource();
    source.extractionQuality.lowConfidencePages = [{page: 2, confidence: 0.4}];
    const map = await loadMap();
    map.coreProblem.sourceRefs[0] = {
      type: "book",
      chapterId: "chapter-micro-retrospective",
      page: 1,
      blockId: "p1-bmissing",
    };

    const issues = validateBookMapAgainstSource(source, map);

    expect(issues.some((issue) => issue.includes("p1-bmissing"))).toBe(true);
    expect(issues.some((issue) => issue.includes("p2-bfeedback-window"))).toBe(true);
    expect(issues.some((issue) => issue.includes("insufficient_evidence"))).toBe(true);
  });

  it("requires exact one-to-one chapter coverage", async () => {
    const source = await loadSource();
    const map = await loadMap();
    map.chapters.pop();

    expect(validateBookMapAgainstSource(source, map)).toContain(
      "Missing mapped chapter: chapter-feedback-window",
    );
  });

  it("requires recurring concepts and Phase 3B targets to cite their stated chapters", async () => {
    const source = await loadSource();
    const map = await loadMap();
    map.recurringConcepts[0]!.sourceRefs = [
      map.recurringConcepts[0]!.sourceRefs[0]!,
    ];
    map.phase3BTargets[0]!.sourceRefs = [{
      type: "book",
      chapterId: "chapter-feedback-window",
      page: 2,
      blockId: "p2-bfeedback-window",
    }];

    const issues = validateBookMapAgainstSource(source, map);

    expect(issues).toContain(
      "Recurring concept 行动反馈闭环 lacks evidence from chapter-feedback-window",
    );
    expect(issues).toContain(
      "Phase 3B target chapter-micro-retrospective cites a different chapter",
    );
  });
});
