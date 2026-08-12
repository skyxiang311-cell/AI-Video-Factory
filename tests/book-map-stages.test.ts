import {describe, expect, it} from "vitest";
import {
  MiniChapterMapSchema,
  WholeBookSynthesisSchema,
  normalizeMiniChapterMap,
  normalizeWholeBookSynthesis,
  validateWholeBookSynthesisQuality,
  type MiniChapterMap,
  type WholeBookSynthesis,
} from "../src/research/book/book-map-stages";

const reference = (chapterId: string, chapterNumber: number) => ({
  type: "book" as const,
  chapterId,
  page: chapterNumber,
  blockId: `p${chapterNumber}-b1`,
});

const mini = (chapterNumber: number, importance: number): MiniChapterMap => {
  const chapterId = `chapter-${String(chapterNumber).padStart(3, "0")}`;
  return MiniChapterMapSchema.parse({
    chapterId,
    title: `第${chapterNumber}章 独有主题${chapterNumber}`,
    role: `承担结构功能${chapterNumber}`,
    oneSentenceSummary: `独有主题${chapterNumber}解释了本章特定机制。`,
    keyConcepts: [`概念${chapterNumber}`],
    candidateTheses: [`候选命题${chapterNumber}`],
    importance,
    deepReadPriority: importance >= 80 ? "high" : importance >= 50 ? "medium" : "low",
    sourceRefs: [reference(chapterId, chapterNumber)],
    analysisConfidence: 0.9,
  });
};

const synthesis = (minis: MiniChapterMap[]): WholeBookSynthesis => WholeBookSynthesisSchema.parse({
  analysisLanguage: "zh-CN",
  coreProblem: {summary: "全书核心问题", sourceRefs: minis.slice(0, 2).flatMap((item) => item.sourceRefs)},
  candidateCoreTheses: [{
    statement: "跨章候选命题",
    confidence: 0.85,
    sourceRefs: minis.slice(0, 2).flatMap((item) => item.sourceRefs),
  }],
  structureOverview: {
    summary: "全书结构",
    sourceRefs: minis.slice(0, 2).flatMap((item) => item.sourceRefs),
    parts: [{
      title: "结构部分",
      chapterIds: minis.map((item) => item.chapterId),
      function: "比较全部章节",
      sourceRefs: minis.slice(0, 2).flatMap((item) => item.sourceRefs),
    }],
  },
  recurringConcepts: [],
  chapterImportanceRanking: minis.map((item) => ({
    chapterId: item.chapterId,
    importance: item.importance,
    deepReadPriority: item.deepReadPriority,
    reason: `与全书其他章节比较后的排序理由${item.chapterId}`,
  })),
  phase3BTargets: [minis[0], minis[2], minis[4]].map((item) => ({
    chapterId: item!.chapterId,
    priority: item!.importance,
    reason: "该章存在关键论证与适用边界，需要进一步深读核验。",
    sourceRefs: item!.sourceRefs,
  })),
  warnings: [],
});

describe("two-stage Book Map contracts", () => {
  it("normalizes templated summaries and keeps only refs needed for the chapter analysis", () => {
    const input = mini(1, 80);
    input.oneSentenceSummary = "本章分析了阶层流动的制度边界。";
    input.candidateTheses = ["命题一", "命题二", "命题三"];
    input.sourceRefs = Array.from({length: 8}, (_, index) => ({
      type: "book" as const,
      chapterId: input.chapterId,
      page: index + 1,
      blockId: `p${index + 1}-b1`,
    }));

    const normalized = normalizeMiniChapterMap(input);

    expect(normalized.oneSentenceSummary).toBe("分析了阶层流动的制度边界。");
    expect(normalized.sourceRefs).toHaveLength(4);
    expect(normalized.sourceRefs[0]?.page).toBe(1);
    expect(normalized.sourceRefs.at(-1)?.page).toBe(8);
  });

  it("keeps recurring-concept chapters only when that chapter has cited evidence", () => {
    const minis = [80, 70, 60, 50, 40, 30].map((score, index) => mini(index + 1, score));
    const result = synthesis(minis);
    result.recurringConcepts = [{
      concept: "分层机制",
      chapterIds: minis.slice(0, 3).map((item) => item.chapterId),
      summary: "概念跨章出现。",
      sourceRefs: [minis[0]!.sourceRefs[0]!, minis[2]!.sourceRefs[0]!],
    }, {
      concept: "单章误判",
      chapterIds: minis.slice(0, 2).map((item) => item.chapterId),
      summary: "只有一个章节有引用。",
      sourceRefs: minis[0]!.sourceRefs,
    }];

    const normalized = normalizeWholeBookSynthesis(result);

    expect(normalized.recurringConcepts).toHaveLength(1);
    expect(normalized.recurringConcepts[0]?.chapterIds).toEqual([
      "chapter-001",
      "chapter-003",
    ]);
  });

  it("parses a traceable MiniChapterMap with evidence-sized source refs", () => {
    const parsed = MiniChapterMapSchema.parse({
      ...mini(1, 91),
      sourceRefs: Array.from({length: 5}, (_, index) => ({
        type: "book",
        chapterId: "chapter-001",
        page: index + 1,
        blockId: `p${index + 1}-b1`,
      })),
    });

    expect(parsed.sourceRefs).toHaveLength(5);
    expect(parsed.importance).toBe(91);
    expect(parsed.analysisConfidence).toBe(0.9);
  });

  it("accepts varied whole-book ranking and 3-8 non-prefix Phase 3B targets", () => {
    const minis = [90, 76, 61, 45, 82, 33].map((score, index) => mini(index + 1, score));
    const result = synthesis(minis);

    expect(validateWholeBookSynthesisQuality(minis, result)).toEqual([]);
  });

  it("rejects uniform importance, prefix-only targets, and invalid recommendation reasons", () => {
    const minis = Array.from({length: 6}, (_, index) => mini(index + 1, 50));
    const result = synthesis(minis);
    result.chapterImportanceRanking.forEach((ranking) => {
      ranking.importance = 50;
    });
    result.phase3BTargets = [minis[0], minis[1], minis[2]].map((item) => ({
      chapterId: item!.chapterId,
      priority: item!.importance,
      reason: "该章存在关键论证与适用边界，需要进一步深读核验。",
      sourceRefs: item!.sourceRefs,
    }));
    result.phase3BTargets[0]!.reason = "该章节已分析，无需进一步深读。";

    const issues = validateWholeBookSynthesisQuality(minis, result);

    expect(issues).toContain("Whole-book importance ranking must contain at least 3 distinct values");
    expect(issues).toContain("Phase 3B targets must not mechanically select only the opening chapters");
    expect(issues).toContain("Phase 3B recommendation must explain why further deep reading is needed: chapter-001");
  });
});
