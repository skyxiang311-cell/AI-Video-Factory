import {z} from "zod";
import {BookSourceRefSchema, ConfidenceSchema, SourceRefSchema} from "./common-schema";

const ImportanceSchema = z.object({
  score: z.number().min(0).max(100),
  level: z.string().min(1),
  reason: z.string().min(1),
});

export const EvidenceTypeSchema = z.enum([
  "study",
  "statistic",
  "case",
  "anecdote",
  "historical_event",
  "logical_argument",
  "expert_opinion",
  "chart",
  "table",
  "author_observation",
]);

export const ChapterRoleSchema = z.enum([
  "foundation",
  "core_argument",
  "evidence",
  "case_study",
  "method",
  "counterargument",
  "application",
  "summary",
  "supplementary",
]);

export const VerificationStatusSchema = z.enum([
  "not_required",
  "needs_external_check",
  "verified",
  "unverified",
]);

export const ClaimSchema = z.object({
  claimId: z.string().regex(/^claim-[a-z0-9-]+$/),
  type: z.string().min(1),
  statement: z.string().min(1),
  importance: ImportanceSchema,
  authorPosition: z.string().min(1),
  scope: z.object({
    appliesTo: z.array(z.string().min(1)).min(1),
    doesNotNecessarilyApplyTo: z.array(z.string().min(1)).min(1),
  }),
  bookEvidenceRefs: z.array(BookSourceRefSchema).min(1),
  sourceRefs: z.array(SourceRefSchema),
  confidence: ConfidenceSchema,
  verificationStatus: VerificationStatusSchema,
}).superRefine((claim, context) => {
  if (claim.importance.score >= 80 && claim.sourceRefs.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceRefs"],
      message: "High-importance claims must include source references",
    });
  }
});

export const EvidenceSchema = z.object({
  evidenceId: z.string().regex(/^evidence-[a-z0-9-]+$/),
  type: EvidenceTypeSchema,
  summary: z.string().min(1),
  supportsClaimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/)),
  strength: z.number().min(0).max(1),
  sourceRef: SourceRefSchema,
  originalExcerpt: z.string().min(1),
  interpretation: z.string().min(1),
  confidence: ConfidenceSchema,
});

export const ChapterAnalysisSchema = z.object({
  chapterId: z.string().regex(/^chapter-[a-z0-9-]+$/),
  title: z.string().min(1),
  importance: ImportanceSchema,
  chapterRole: ChapterRoleSchema,
  summary: z.object({
    oneSentence: z.string().min(1),
    detailed: z.string().min(1),
  }),
  claims: z.array(ClaimSchema),
  arguments: z.array(z.string()),
  evidence: z.array(EvidenceSchema),
  examples: z.array(z.string()),
  concepts: z.array(z.string()),
  questions: z.array(z.string()),
  limitations: z.array(z.string()),
  relationsToOtherChapters: z.array(z.string()),
  quality: z.object({confidence: ConfidenceSchema}),
}).superRefine((chapter, context) => {
  const claimIds = new Set<string>();
  chapter.claims.forEach((claim, index) => {
    if (claimIds.has(claim.claimId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["claims", index, "claimId"],
        message: "Claim ids must be unique within a chapter analysis",
      });
    }
    claimIds.add(claim.claimId);
  });

  const evidenceIds = new Set<string>();
  chapter.evidence.forEach((evidence, index) => {
    if (evidenceIds.has(evidence.evidenceId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence", index, "evidenceId"],
        message: "Evidence ids must be unique within a chapter analysis",
      });
    }
    evidenceIds.add(evidence.evidenceId);
  });
});

export type Claim = z.infer<typeof ClaimSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type ChapterAnalysis = z.infer<typeof ChapterAnalysisSchema>;
