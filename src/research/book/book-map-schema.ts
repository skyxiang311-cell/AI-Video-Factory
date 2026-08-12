import {z} from "zod";
import {ArtifactMetaSchema, BookSourceRefSchema, ConfidenceSchema} from "./common-schema";

const SourceRefsSchema = z.array(BookSourceRefSchema).min(1);
const ImportanceScoreSchema = z.number().int().min(0).max(100);
const ChapterIdSchema = z.string().regex(/^chapter-[a-z0-9-]+$/);
const DeepReadPrioritySchema = z.enum(["high", "medium", "low"]);

const CoreProblemSchema = z.object({
  summary: z.string().min(1),
  sourceRefs: SourceRefsSchema,
});

const CandidateCoreThesisSchema = z.object({
  statement: z.string().min(1),
  confidence: ConfidenceSchema,
  sourceRefs: SourceRefsSchema,
});

const StructurePartSchema = z.object({
  title: z.string().min(1),
  chapterIds: z.array(ChapterIdSchema).min(1),
  function: z.string().min(1),
  sourceRefs: SourceRefsSchema,
});

const StructureOverviewSchema = z.object({
  summary: z.string().min(1),
  sourceRefs: SourceRefsSchema,
  parts: z.array(StructurePartSchema).min(1),
});

const ChapterMapBaseShape = {
  chapterId: ChapterIdSchema,
  title: z.string().min(1),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
  role: z.string().min(1),
  summary: z.string().min(1),
};

const ChapterMapEntrySchema = z.discriminatedUnion("analysisStatus", [
  z.object({
    ...ChapterMapBaseShape,
    analysisStatus: z.literal("analyzed"),
    importance: ImportanceScoreSchema,
    deepReadPriority: DeepReadPrioritySchema,
    sourceRefs: SourceRefsSchema,
  }),
  z.object({
    ...ChapterMapBaseShape,
    analysisStatus: z.literal("insufficient_evidence"),
    importance: z.literal(0),
    deepReadPriority: z.literal("low"),
    sourceRefs: z.array(BookSourceRefSchema).max(0),
  }),
]);

const RecurringConceptSchema = z.object({
  concept: z.string().min(1),
  chapterIds: z.array(ChapterIdSchema).min(2),
  summary: z.string().min(1),
  sourceRefs: SourceRefsSchema,
});

const Phase3BTargetSchema = z.object({
  chapterId: ChapterIdSchema,
  priority: ImportanceScoreSchema,
  reason: z.string().min(1),
  sourceRefs: SourceRefsSchema,
});

const ExcludedLowConfidencePageSchema = z.object({
  page: z.number().int().positive(),
  reason: z.string().min(1),
});

export const BookMapDraftSchema = z.object({
  analysisLanguage: z.literal("zh-CN"),
  coreProblem: CoreProblemSchema,
  candidateCoreTheses: z.array(CandidateCoreThesisSchema).min(1),
  structureOverview: StructureOverviewSchema,
  chapters: z.array(ChapterMapEntrySchema).min(1),
  recurringConcepts: z.array(RecurringConceptSchema),
  phase3BTargets: z.array(Phase3BTargetSchema),
  excludedLowConfidencePages: z.array(ExcludedLowConfidencePageSchema),
  warnings: z.array(z.string().min(1)),
}).superRefine((map, context) => {
  const chapterIds = new Set<string>();
  map.chapters.forEach((chapter, index) => {
    if (chapterIds.has(chapter.chapterId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chapters", index, "chapterId"],
        message: "Mapped chapter ids must be unique",
      });
    }
    chapterIds.add(chapter.chapterId);
    if (chapter.endPage < chapter.startPage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chapters", index, "endPage"],
        message: "Chapter end page must not precede its start page",
      });
    }
  });
});

const StructuredOutputChapterSchema = z.object({
  ...ChapterMapBaseShape,
  analysisStatus: z.enum(["analyzed", "insufficient_evidence"]),
  importance: ImportanceScoreSchema,
  deepReadPriority: DeepReadPrioritySchema,
  sourceRefs: z.array(BookSourceRefSchema),
});

export const BookMapStructuredOutputSchema = z.object({
  ...BookMapDraftSchema.shape,
  chapters: z.array(StructuredOutputChapterSchema).min(1),
});

export const BookMapSchema = z.object({
  artifact: ArtifactMetaSchema,
  provider: z.object({
    name: z.string().min(1),
    model: z.string().min(1),
  }),
  ...BookMapDraftSchema.shape,
}).superRefine((map, context) => {
  const chapterIds = new Set<string>();
  map.chapters.forEach((chapter, index) => {
    if (chapterIds.has(chapter.chapterId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chapters", index, "chapterId"],
        message: "Mapped chapter ids must be unique",
      });
    }
    chapterIds.add(chapter.chapterId);
    if (chapter.endPage < chapter.startPage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chapters", index, "endPage"],
        message: "Chapter end page must not precede its start page",
      });
    }
  });
});

export type BookMapDraft = z.infer<typeof BookMapDraftSchema>;
export type BookMap = z.infer<typeof BookMapSchema>;
