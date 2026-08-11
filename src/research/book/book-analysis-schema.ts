import {z} from "zod";
import {SelectedAngleSchema, VideoAnglesSchema} from "./angle-schema";
import {BookSynthesisSchema} from "./synthesis-schema";
import {VerificationRecordSchema} from "./verification-schema";

const QualitySchema = z.record(z.string().min(1), z.number().min(0).max(100));

export const BookAnalysisStatusSchema = z.enum([
  "processing",
  "blocked",
  "needs_review",
  "approved_for_video",
]);

export const BookAnalysisSchema = z.object({
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
