import {z} from "zod";
import {BookSourceRefSchema, ConfidenceSchema} from "./common-schema";
import {BookMapDraftSchema} from "./book-map-schema";

const ChapterIdSchema = z.string().regex(/^chapter-[a-z0-9-]+$/);
const ImportanceSchema = z.number().int().min(0).max(100);
const DeepReadPrioritySchema = z.enum(["high", "medium", "low"]);

export const MiniChapterMapSchema = z.object({
  analysisStatus: z.enum(["analyzed", "insufficient_evidence"]).default("analyzed"),
  chapterId: ChapterIdSchema,
  title: z.string().min(1),
  role: z.string().min(1),
  oneSentenceSummary: z.string().min(1),
  keyConcepts: z.array(z.string().min(1)).min(1).max(8),
  candidateTheses: z.array(z.string().min(1)).min(1).max(5),
  importance: ImportanceSchema,
  deepReadPriority: DeepReadPrioritySchema,
  sourceRefs: z.array(BookSourceRefSchema).max(8),
  analysisConfidence: ConfidenceSchema,
}).superRefine((mini, context) => {
  if (mini.analysisStatus === "analyzed" && mini.sourceRefs.length === 0) {
    context.addIssue({code: "custom", path: ["sourceRefs"], message: "Analyzed chapter requires source refs"});
  }
  if (mini.analysisStatus === "insufficient_evidence") {
    if (mini.sourceRefs.length > 0) {
      context.addIssue({code: "custom", path: ["sourceRefs"], message: "Insufficient chapter cannot cite source refs"});
    }
    if (mini.importance !== 0) {
      context.addIssue({code: "custom", path: ["importance"], message: "Insufficient chapter importance must be 0"});
    }
    if (mini.deepReadPriority !== "low") {
      context.addIssue({code: "custom", path: ["deepReadPriority"], message: "Insufficient chapter priority must be low"});
    }
  }
});

export const ChapterImportanceRankingSchema = z.object({
  chapterId: ChapterIdSchema,
  importance: ImportanceSchema,
  deepReadPriority: DeepReadPrioritySchema,
  reason: z.string().min(1),
});

export const WholeBookSynthesisSchema = z.object({
  analysisLanguage: z.literal("zh-CN"),
  coreProblem: BookMapDraftSchema.shape.coreProblem,
  candidateCoreTheses: BookMapDraftSchema.shape.candidateCoreTheses,
  structureOverview: BookMapDraftSchema.shape.structureOverview,
  recurringConcepts: BookMapDraftSchema.shape.recurringConcepts,
  chapterImportanceRanking: z.array(ChapterImportanceRankingSchema).min(1),
  phase3BTargets: BookMapDraftSchema.shape.phase3BTargets,
  warnings: BookMapDraftSchema.shape.warnings,
});

export interface MiniChapterEvidence {
  chapterId: string;
  title: string;
  startPage: number;
  endPage: number;
  blocks: Array<{
    blockId: string;
    page: number;
    chapterId: string;
    type: string;
    originalText: string;
    language: string;
    confidence: number;
  }>;
}

export interface WholeBookSynthesisInput {
  metadata: {
    title: string;
    authors: string[];
    language: string;
    pageCount: number;
  };
  structure: {
    frontMatter: {startPage: number; endPage: number} | null;
    chapters: Array<{chapterId: string; title: string; startPage: number; endPage: number}>;
    conclusion: {startPage: number; endPage: number} | null;
    appendices: Array<{startPage: number; endPage: number}>;
  };
  miniChapterMaps: MiniChapterMap[];
  excludedLowConfidencePages: Array<{page: number; reason: string}>;
}

export type MiniChapterMap = z.infer<typeof MiniChapterMapSchema>;
export type ChapterImportanceRanking = z.infer<typeof ChapterImportanceRankingSchema>;
export type WholeBookSynthesis = z.infer<typeof WholeBookSynthesisSchema>;

const sampleEvenly = <T>(items: readonly T[], limit: number): T[] => {
  if (items.length <= limit) return [...items];
  if (limit === 1) return [items[0]!];
  return Array.from({length: limit}, (_, index) => (
    items[Math.round(index * (items.length - 1) / (limit - 1))]!
  ));
};

export const normalizeMiniChapterMap = (mini: MiniChapterMap): MiniChapterMap => {
  if (mini.analysisStatus === "insufficient_evidence") return mini;
  const neededReferenceCount = Math.min(6, 1 + mini.candidateTheses.length);
  return MiniChapterMapSchema.parse({
    ...mini,
    oneSentenceSummary: mini.oneSentenceSummary.replace(/^本章/u, "").trim(),
    sourceRefs: sampleEvenly(mini.sourceRefs, neededReferenceCount),
  });
};

export const normalizeWholeBookSynthesis = (
  synthesis: WholeBookSynthesis,
): WholeBookSynthesis => WholeBookSynthesisSchema.parse({
  ...synthesis,
  recurringConcepts: synthesis.recurringConcepts.flatMap((concept) => {
    const citedChapterIds = new Set(concept.sourceRefs.map((reference) => reference.chapterId));
    const supportedChapterIds = concept.chapterIds.filter((chapterId) => (
      citedChapterIds.has(chapterId)
    ));
    return supportedChapterIds.length >= 2
      ? [{...concept, chapterIds: supportedChapterIds}]
      : [];
  }),
});

const GENERIC_RECOMMENDATION = /(?:无需|不需).{0,8}(?:进一步)?深读|已分析.{0,8}(?:无需|不需)/u;

export const validateWholeBookSynthesisQuality = (
  minis: readonly MiniChapterMap[],
  synthesis: WholeBookSynthesis,
): string[] => {
  const issues: string[] = [];
  const miniIds = new Set(minis.map((mini) => mini.chapterId));
  const rankingIds = new Set(synthesis.chapterImportanceRanking.map((item) => item.chapterId));

  if (
    rankingIds.size !== miniIds.size
    || Array.from(miniIds).some((chapterId) => !rankingIds.has(chapterId))
  ) {
    issues.push("Whole-book importance ranking must cover every MiniChapterMap exactly once");
  }

  const analyzedMinis = minis.filter((mini) => mini.analysisStatus === "analyzed");
  if (analyzedMinis.length >= 3) {
    const distinctImportance = new Set(
      synthesis.chapterImportanceRanking.map((item) => item.importance),
    );
    if (distinctImportance.size < 3) {
      issues.push("Whole-book importance ranking must contain at least 3 distinct values");
    }
  }

  const minimumTargets = analyzedMinis.length >= 3 ? 3 : Math.min(1, analyzedMinis.length);
  const maximumTargets = Math.min(8, analyzedMinis.length);
  if (
    synthesis.phase3BTargets.length < minimumTargets
    || synthesis.phase3BTargets.length > maximumTargets
  ) {
    issues.push("Whole-book synthesis must select 3-8 Phase 3B targets");
  }

  const targetIds = synthesis.phase3BTargets.map((target) => target.chapterId);
  if (new Set(targetIds).size !== targetIds.length) {
    issues.push("Phase 3B targets must be unique");
  }
  for (const target of synthesis.phase3BTargets) {
    if (GENERIC_RECOMMENDATION.test(target.reason)) {
      issues.push(
        `Phase 3B recommendation must explain why further deep reading is needed: ${target.chapterId}`,
      );
    }
  }

  if (minis.length >= 6 && targetIds.length >= 3) {
    const openingIds = new Set(minis.slice(0, targetIds.length).map((mini) => mini.chapterId));
    if (targetIds.every((chapterId) => openingIds.has(chapterId))) {
      issues.push("Phase 3B targets must not mechanically select only the opening chapters");
    }
  }

  return issues;
};
