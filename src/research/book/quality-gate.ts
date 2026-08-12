import {z} from "zod";

export const DeepReadingBlockingIssueSchema = z.enum([
  "CORE_NUMBER_MISSING_SOURCE",
  "CORE_CLAIM_MISSING_SOURCE",
  "LOW_CONFIDENCE_CORE_EVIDENCE",
  "TRANSLATION_SEMANTIC_DRIFT",
  "SELECTED_ANGLE_USES_UNVERIFIED_EVIDENCE",
]);

export type DeepReadingBlockingIssue = z.infer<typeof DeepReadingBlockingIssueSchema>;

export const DeepReadingQualityStatusSchema = z.enum([
  "processing",
  "blocked",
  "needs_review",
  "approved_for_video",
]);

export const evaluateDeepReadingQuality = ({
  score,
  blockingIssues,
}: {
  score: number;
  blockingIssues: DeepReadingBlockingIssue[];
}) => {
  if (blockingIssues.length > 0 || score < 75) {
    return {status: "blocked" as const, score, blockingIssues};
  }
  if (score < 85) {
    return {status: "needs_review" as const, score, blockingIssues};
  }
  return {status: "approved_for_video" as const, score, blockingIssues};
};

export const DeepReadingQualityGateSchema = z.object({
  passed: z.boolean(),
  status: DeepReadingQualityStatusSchema,
  score: z.number().min(0).max(100),
  blockingIssues: z.array(DeepReadingBlockingIssueSchema),
  syntheticFixture: z.boolean().optional(),
}).superRefine((gate, context) => {
  if (gate.status === "processing") {
    if (gate.passed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passed"],
        message: "A processing quality gate cannot be marked as passed",
      });
    }
    return;
  }

  const expected = evaluateDeepReadingQuality({
    score: gate.score,
    blockingIssues: gate.blockingIssues,
  });
  if (gate.status !== expected.status) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: `Quality gate status must be ${expected.status} for its score and blocking issues`,
    });
  }
  if (gate.passed !== (expected.status === "approved_for_video")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["passed"],
      message: "Quality gate passed must match approved_for_video status",
    });
  }
});

export type DeepReadingQualityStatus = z.infer<typeof DeepReadingQualityStatusSchema>;
export type DeepReadingQualityGate = z.infer<typeof DeepReadingQualityGateSchema>;
