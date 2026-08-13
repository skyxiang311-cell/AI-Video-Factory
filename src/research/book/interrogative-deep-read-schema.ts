import {z} from "zod";
import {BookSourceRefSchema, ConfidenceSchema} from "./common-schema";

const ChapterIdSchema = z.string().regex(/^chapter-[a-z0-9-]+$/);
const ClaimIdSchema = z.string().regex(/^claim-[a-z0-9-]+$/);
const SourceRefsSchema = z.array(BookSourceRefSchema).min(1).max(12);
const NoteSchema = z.string().min(1).max(400);

export const ClaimClassificationSchema = z.enum([
  "fact",
  "author_judgment",
  "inference",
]);

const ClaimAssessmentSchema = z.object({
  claimId: ClaimIdSchema,
  classification: ClaimClassificationSchema,
  sourceRefs: SourceRefsSchema,
});

const RevisedClaimSchema = z.object({
  originalClaimId: ClaimIdSchema,
  statement: NoteSchema,
  reason: NoteSchema,
  sourceRefs: SourceRefsSchema,
});

const EvidenceLimitSchema = z.object({
  claimId: ClaimIdSchema,
  proves: NoteSchema,
  doesNotProve: NoteSchema,
  sourceRefs: SourceRefsSchema,
});

const CausalAssessmentSchema = z.object({
  claimId: ClaimIdSchema,
  status: z.enum(["supported", "association_only", "overclaim", "not_applicable"]),
  assessment: NoteSchema,
  sourceRefs: SourceRefsSchema,
});

const SourcedStatementSchema = z.object({
  statement: NoteSchema,
  sourceRefs: SourceRefsSchema,
});

const ContradictionSchema = z.object({
  relatedChapterId: ChapterIdSchema,
  statement: NoteSchema,
  sourceRefs: SourceRefsSchema,
});

const ScopeCorrectionSchema = z.object({
  claimId: ClaimIdSchema,
  correction: NoteSchema,
  sourceRefs: SourceRefsSchema,
});

const UnresolvedQuestionSchema = z.object({
  question: NoteSchema,
  sourceRefs: SourceRefsSchema,
});

const ChapterRelationSchema = z.object({
  relatedChapterId: ChapterIdSchema,
  relation: NoteSchema,
  sourceRefs: SourceRefsSchema,
});

export const InterrogativeDeepReadDraftSchema = z.object({
  claimAssessments: z.array(ClaimAssessmentSchema).min(1).max(3),
  revisedClaims: z.array(RevisedClaimSchema).max(3),
  evidenceLimits: z.array(EvidenceLimitSchema).min(1).max(3),
  causalAssessment: z.array(CausalAssessmentSchema).min(1).max(3),
  hiddenAssumptions: z.array(SourcedStatementSchema).max(4),
  counterpoints: z.array(SourcedStatementSchema).max(4),
  contradictions: z.array(ContradictionSchema).max(3),
  scopeCorrections: z.array(ScopeCorrectionSchema).max(3),
  unresolvedQuestions: z.array(UnresolvedQuestionSchema).max(4),
  relationsToOtherChapters: z.array(ChapterRelationSchema).max(4),
  finalJudgment: NoteSchema,
  confidence: ConfidenceSchema,
  sourceRefs: SourceRefsSchema,
});

export const InterrogativeDeepReadSchema = z.object({
  chapterId: ChapterIdSchema,
  originalClaims: z.array(z.object({
    claimId: ClaimIdSchema,
    statement: NoteSchema,
    classification: ClaimClassificationSchema,
    sourceRefs: SourceRefsSchema,
  })).min(1).max(3),
  revisedClaims: InterrogativeDeepReadDraftSchema.shape.revisedClaims,
  evidenceLimits: InterrogativeDeepReadDraftSchema.shape.evidenceLimits,
  causalAssessment: InterrogativeDeepReadDraftSchema.shape.causalAssessment,
  hiddenAssumptions: InterrogativeDeepReadDraftSchema.shape.hiddenAssumptions,
  counterpoints: InterrogativeDeepReadDraftSchema.shape.counterpoints,
  contradictions: InterrogativeDeepReadDraftSchema.shape.contradictions,
  scopeCorrections: InterrogativeDeepReadDraftSchema.shape.scopeCorrections,
  unresolvedQuestions: InterrogativeDeepReadDraftSchema.shape.unresolvedQuestions,
  relationsToOtherChapters: InterrogativeDeepReadDraftSchema.shape.relationsToOtherChapters,
  finalJudgment: InterrogativeDeepReadDraftSchema.shape.finalJudgment,
  confidence: InterrogativeDeepReadDraftSchema.shape.confidence,
  sourceRefs: InterrogativeDeepReadDraftSchema.shape.sourceRefs,
});

export type InterrogativeDeepReadDraft = z.infer<typeof InterrogativeDeepReadDraftSchema>;
export type InterrogativeDeepRead = z.infer<typeof InterrogativeDeepReadSchema>;
