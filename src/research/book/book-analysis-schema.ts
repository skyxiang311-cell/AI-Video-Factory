import {z} from "zod";
import {SelectedAngleSchema, VideoAnglesSchema} from "./angle-schema";
import {BookSynthesisSchema} from "./synthesis-schema";
import {VerificationRecordSchema} from "./verification-schema";

const QualitySchema = z.record(z.string().min(1), z.number().min(0).max(100));
const ArtifactIndexSchema = z.object({
  source: z.string().min(1),
  chapters: z.string().min(1),
  synthesis: z.string().min(1),
  verification: z.string().min(1),
  angles: z.string().min(1),
});

export const BookAnalysisStatusSchema = z.enum([
  "processing",
  "blocked",
  "needs_review",
  "approved_for_video",
]);

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
  artifacts: ArtifactIndexSchema,
  qualityGate: z.record(z.string().min(1), z.unknown()),
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
});

export type BookAnalysisStatus = z.infer<typeof BookAnalysisStatusSchema>;
export type BookAnalysis = z.infer<typeof BookAnalysisSchema>;
