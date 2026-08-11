export type DeepReadingBlockingIssue =
  | "CORE_NUMBER_MISSING_SOURCE"
  | "CORE_CLAIM_MISSING_SOURCE"
  | "LOW_CONFIDENCE_CORE_EVIDENCE"
  | "TRANSLATION_SEMANTIC_DRIFT"
  | "SELECTED_ANGLE_USES_UNVERIFIED_EVIDENCE";

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
