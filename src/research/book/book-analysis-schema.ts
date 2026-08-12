import {z} from "zod";
import {SelectedAngleSchema, VideoAnglesSchema} from "./angle-schema";
import {
  DeepReadingQualityGateSchema,
  DeepReadingQualityStatusSchema,
} from "./quality-gate";
import {BookSynthesisSchema} from "./synthesis-schema";
import {VerificationRecordSchema} from "./verification-schema";

const QualitySchema = z.record(z.string().min(1), z.number().min(0).max(100));
export const BookArtifactIndexSchema = z.object({
  source: z.string().min(1),
  chapters: z.array(z.string().min(1)).min(1),
  synthesis: z.string().min(1),
  verification: z.string().min(1),
  angles: z.string().min(1),
  selectedAngle: z.string().min(1),
});

export const BookAnalysisStatusSchema = DeepReadingQualityStatusSchema;

export const BookAnalysisSchema = z.object({
  bookId: z.string().min(1),
  deepReadingScore: z.number().min(0).max(100),
  coreThesis: z.string().min(1),
  keyConcepts: z.array(z.string().min(1)),
  coreClaimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/)),
  verifiedClaimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/)),
  importantLimitations: z.array(z.string().min(1)),
  practicalFrameworks: z.array(z.string().min(1)),
  recommendedAngleId: z.string().min(1),
  artifacts: BookArtifactIndexSchema,
  qualityGate: DeepReadingQualityGateSchema,
  synthesis: BookSynthesisSchema,
  verificationRecords: z.array(VerificationRecordSchema),
  videoAngles: VideoAnglesSchema,
  selectedAngle: SelectedAngleSchema.nullable(),
  status: BookAnalysisStatusSchema,
  quality: QualitySchema,
}).superRefine((analysis, context) => {
  const total = Object.values(analysis.quality).reduce((sum, score) => sum + score, 0);
  if (total !== 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quality"],
      message: "Quality components must sum to 100",
    });
  }
  if (analysis.deepReadingScore !== analysis.qualityGate.score) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["qualityGate", "score"],
      message: "Quality gate score must match deepReadingScore",
    });
  }
  if (analysis.status !== analysis.qualityGate.status) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "Analysis status must match the authoritative quality gate status",
    });
  }
});

export type BookAnalysisStatus = z.infer<typeof BookAnalysisStatusSchema>;
export type BookAnalysis = z.infer<typeof BookAnalysisSchema>;
