import type {SelectedAngle, VideoAngles} from "./angle-schema";
import type {BookAnalysis} from "./book-analysis-schema";
import type {BookSourceRef, SourceRef} from "./common-schema";
import type {ChapterAnalysis} from "./knowledge-schema";
import type {BookSource} from "./source-schema";
import type {BookSynthesis} from "./synthesis-schema";
import type {VerificationRecord} from "./verification-schema";

export type BookValidationSeverity = "BLOCK" | "WARN" | "INFO";

export type BookValidationIssue = {
  code: string;
  severity: BookValidationSeverity;
  message: string;
  affectedArtifact: string;
  affectedClaims: string[];
  retryStrategy: string;
  blocking: boolean;
};

type BookBlock = {
  chapterId: string;
  page: number;
  blockId: string;
};

type BookSourceLike = {
  pages: readonly {contentBlocks: readonly BookBlock[]}[];
};

type ClaimLike = {
  claimId: string;
  bookEvidenceRefs: readonly BookSourceRef[];
  sourceRefs: readonly SourceRef[];
  verificationStatus?: "not_required" | "needs_external_check" | "verified" | "unverified";
};

type EvidenceLike = {
  evidenceId: string;
  supportsClaimIds: readonly string[];
  sourceRef: SourceRef;
};

type ChapterAnalysisLike = {
  chapterId: string;
  claims: readonly ClaimLike[];
  evidence: readonly EvidenceLike[];
};

type SelectedAngleLike = {
  angleId: string;
  mustInclude: {
    claims: readonly string[];
    evidence: readonly string[];
  };
};

export type BookArtifactGraph = {
  bookSource: BookSource;
  chapterAnalyses: readonly ChapterAnalysis[];
  synthesis: BookSynthesis;
  verificationRecords: readonly VerificationRecord[];
  videoAngles: VideoAngles;
  selectedAngle: SelectedAngle | null;
  analysis: BookAnalysis;
};

const sourceRefKey = ({chapterId, page, blockId}: Pick<BookSourceRef, "chapterId" | "page" | "blockId">): string =>
  `${chapterId}:${page}:${blockId}`;

const blockingIssue = (
  code: string,
  message: string,
  affectedArtifact: string,
  affectedClaims: string[],
  retryStrategy: string,
): BookValidationIssue => ({
  code,
  severity: "BLOCK",
  message,
  affectedArtifact,
  affectedClaims,
  retryStrategy,
  blocking: true,
});

const bookRefsForClaim = (claim: ClaimLike): BookSourceRef[] => [
  ...claim.bookEvidenceRefs,
  ...claim.sourceRefs.filter((sourceRef): sourceRef is BookSourceRef => sourceRef.type === "book"),
];

const knownIds = (ids: ReadonlySet<string> | readonly string[]): Set<string> => new Set(ids);

export const validateBookSourceRefs = (
  bookSource: BookSourceLike,
  chapterAnalyses: readonly ChapterAnalysisLike[],
): BookValidationIssue[] => {
  const sourceBlocks = new Map<string, BookBlock>();
  for (const page of bookSource.pages) {
    for (const block of page.contentBlocks) {
      sourceBlocks.set(sourceRefKey(block), block);
    }
  }

  const issues: BookValidationIssue[] = [];
  for (const chapter of chapterAnalyses) {
    for (const claim of chapter.claims) {
      const checkedRefs = new Set<string>();
      for (const sourceRef of bookRefsForClaim(claim)) {
        const key = sourceRefKey(sourceRef);
        if (!sourceBlocks.has(key) && !checkedRefs.has(key)) {
          issues.push(blockingIssue(
            "MISSING_BOOK_BLOCK",
            `Claim ${claim.claimId} references missing book block ${key}.`,
            chapter.chapterId,
            [claim.claimId],
            "Correct the source reference and rerun the affected chapter analysis.",
          ));
        }
        checkedRefs.add(key);
      }
    }

    for (const evidence of chapter.evidence) {
      if (evidence.sourceRef.type !== "book") continue;
      const key = sourceRefKey(evidence.sourceRef);
      if (!sourceBlocks.has(key)) {
        issues.push(blockingIssue(
          "MISSING_BOOK_BLOCK",
          `Evidence ${evidence.evidenceId} references missing book block ${key}.`,
          chapter.chapterId,
          [...evidence.supportsClaimIds],
          "Correct the source reference and rerun the affected chapter analysis.",
        ));
      }
    }
  }

  return issues;
};

export const validateEvidenceRefs = (
  chapterAnalyses: readonly ChapterAnalysisLike[],
): BookValidationIssue[] => {
  const claims = new Map<string, ClaimLike>();
  for (const chapter of chapterAnalyses) {
    for (const claim of chapter.claims) claims.set(claim.claimId, claim);
  }

  const issues: BookValidationIssue[] = [];
  for (const chapter of chapterAnalyses) {
    for (const evidence of chapter.evidence) {
      for (const claimId of evidence.supportsClaimIds) {
        if (!claims.has(claimId)) {
          issues.push(blockingIssue(
            "MISSING_EVIDENCE_CLAIM",
            `Evidence ${evidence.evidenceId} references unknown claim ${claimId}.`,
            chapter.chapterId,
            [claimId],
            "Correct the evidence claim reference and rerun the affected chapter analysis.",
          ));
        }
      }
    }
  }

  return issues;
};

export const validateAngleRefs = (
  videoAngles: VideoAngles,
  knownClaimIds: ReadonlySet<string> | readonly string[],
): BookValidationIssue[] => {
  const claims = knownIds(knownClaimIds);
  const issues: BookValidationIssue[] = [];

  for (const angle of videoAngles.candidates) {
    for (const claimId of angle.claimIds) {
      if (!claims.has(claimId)) {
        issues.push(blockingIssue(
          "MISSING_ANGLE_CLAIM",
          `Angle ${angle.angleId} references unknown claim ${claimId}.`,
          angle.angleId,
          [claimId],
          "Correct the angle claim reference and rerun angle selection.",
        ));
      }
    }
  }

  return issues;
};

export const validateSelectedAngleRefs = (
  selectedAngle: SelectedAngleLike,
  knownClaimIds: ReadonlySet<string> | readonly string[],
  knownEvidenceIds: ReadonlySet<string> | readonly string[],
): BookValidationIssue[] => {
  const claims = knownIds(knownClaimIds);
  const evidence = knownIds(knownEvidenceIds);
  const issues: BookValidationIssue[] = [];

  for (const claimId of selectedAngle.mustInclude.claims) {
    if (!claims.has(claimId)) {
      issues.push(blockingIssue(
        "MISSING_SELECTED_ANGLE_CLAIM",
        `Selected angle ${selectedAngle.angleId} references unknown claim ${claimId}.`,
        selectedAngle.angleId,
        [claimId],
        "Correct the selected angle claim reference and rerun angle selection.",
      ));
    }
  }

  for (const evidenceId of selectedAngle.mustInclude.evidence) {
    if (!evidence.has(evidenceId)) {
      issues.push(blockingIssue(
        "MISSING_SELECTED_ANGLE_EVIDENCE",
        `Selected angle ${selectedAngle.angleId} references unknown evidence ${evidenceId}.`,
        selectedAngle.angleId,
        [],
        "Correct the selected angle evidence reference and rerun angle selection.",
      ));
    }
  }

  return issues;
};

const validateSynthesisRefs = (
  synthesis: BookSynthesis,
  claimIds: ReadonlySet<string>,
  code: string,
  affectedArtifact: string,
): BookValidationIssue[] => {
  const issues: BookValidationIssue[] = [];
  for (const relation of synthesis.claimRelations) {
    for (const claimId of [relation.fromClaimId, relation.toClaimId]) {
      if (!claimIds.has(claimId)) {
        issues.push(blockingIssue(
          code,
          `${affectedArtifact} references unknown claim ${claimId}.`,
          affectedArtifact,
          [claimId],
          "Correct the synthesis claim reference and rerun book synthesis.",
        ));
      }
    }
  }
  return issues;
};

const validateVerificationRefs = (
  verificationRecords: readonly VerificationRecord[],
  claimIds: ReadonlySet<string>,
  code: string,
  affectedArtifact: string,
): BookValidationIssue[] => verificationRecords.flatMap((record) =>
  claimIds.has(record.claimId)
    ? []
    : [blockingIssue(
      code,
      `${affectedArtifact} references unknown claim ${record.claimId}.`,
      affectedArtifact,
      [record.claimId],
      "Correct the verification claim reference and rerun external verification.",
    )],
);

const validateKnownClaimIds = (
  referencedClaimIds: readonly string[],
  claimIds: ReadonlySet<string>,
  code: string,
  affectedArtifact: string,
): BookValidationIssue[] => referencedClaimIds.flatMap((claimId) =>
  claimIds.has(claimId)
    ? []
    : [blockingIssue(
      code,
      `${affectedArtifact} references unknown claim ${claimId}.`,
      affectedArtifact,
      [claimId],
      "Correct the unified analysis claim reference and rebuild book-analysis.json.",
    )],
);

const validateAngleIdentity = (
  angleId: string,
  videoAngles: VideoAngles,
  code: string,
  affectedArtifact: string,
): BookValidationIssue[] => videoAngles.candidates.some((angle) => angle.angleId === angleId)
  ? []
  : [blockingIssue(
    code,
    `${affectedArtifact} references unknown angle ${angleId}.`,
    affectedArtifact,
    [],
    "Select an angle that exists in video-angles.json and rebuild downstream artifacts.",
  )];

const validateAngleInvariants = (
  videoAngles: VideoAngles,
  claimsById: ReadonlyMap<string, ClaimLike>,
  verificationRecords: readonly VerificationRecord[],
  affectedArtifact: string,
): BookValidationIssue[] => {
  const issues: BookValidationIssue[] = [];
  const seenAngleIds = new Set<string>();
  const blockingVerdicts = new Set<VerificationRecord["verdict"]>([
    "uncertain",
    "outdated",
    "contradicted",
    "not_verifiable",
  ]);
  const verdictsByClaimId = new Map<string, VerificationRecord["verdict"][]>();
  for (const record of verificationRecords) {
    const verdicts = verdictsByClaimId.get(record.claimId) ?? [];
    verdicts.push(record.verdict);
    verdictsByClaimId.set(record.claimId, verdicts);
  }

  const recommendedAngles = videoAngles.candidates.filter((angle) => angle.recommended);
  if (recommendedAngles.length !== 1) {
    issues.push(blockingIssue(
      "INVALID_RECOMMENDATION_COUNT",
      `${affectedArtifact} must contain exactly one recommended angle; found ${recommendedAngles.length}.`,
      affectedArtifact,
      [],
      "Choose exactly one eligible candidate as the recommended angle.",
    ));
  }

  for (const angle of videoAngles.candidates) {
    if (seenAngleIds.has(angle.angleId)) {
      issues.push(blockingIssue(
        "DUPLICATE_ANGLE_ID",
        `Angle id ${angle.angleId} is duplicated in ${affectedArtifact}.`,
        angle.angleId,
        [...angle.claimIds],
        "Regenerate candidate angles with unique angle ids.",
      ));
    }
    seenAngleIds.add(angle.angleId);

    if (angle.recommended && !angle.eligible) {
      issues.push(blockingIssue(
        "RECOMMENDED_ANGLE_INELIGIBLE",
        `Recommended angle ${angle.angleId} is not eligible.`,
        angle.angleId,
        [...angle.claimIds],
        "Recommend an eligible angle or repair the candidate evidence first.",
      ));
    }

    if (!angle.eligible) continue;
    for (const claimId of angle.claimIds) {
      const claim = claimsById.get(claimId);
      if (!claim) continue;
      const claimStatusUsable = claim.verificationStatus === "verified"
        || claim.verificationStatus === "not_required";
      const verdictsUsable = !(verdictsByClaimId.get(claimId) ?? [])
        .some((verdict) => blockingVerdicts.has(verdict));
      if (!claimStatusUsable || !verdictsUsable) {
        issues.push(blockingIssue(
          "INELIGIBLE_ANGLE_CLAIM",
          `Eligible angle ${angle.angleId} depends on unusable claim ${claimId}.`,
          angle.angleId,
          [claimId],
          "Mark the angle ineligible or verify and repair the referenced Claim.",
        ));
      }
    }
  }

  return issues;
};

const validateSelectedMatchesRecommended = (
  selectedAngle: SelectedAngle,
  videoAngles: VideoAngles,
  affectedArtifact: string,
): BookValidationIssue[] => {
  const recommended = videoAngles.candidates.find((angle) => angle.recommended);
  if (!recommended || selectedAngle.angleId === recommended.angleId) return [];
  return [blockingIssue(
    "SELECTED_ANGLE_NOT_RECOMMENDED",
    `Selected angle ${selectedAngle.angleId} does not match recommended angle ${recommended.angleId}.`,
    affectedArtifact,
    [...selectedAngle.mustInclude.claims],
    "Select the recommended eligible angle or update the recommendation decision.",
  )];
};

const validateRecommendedAngleId = (
  recommendedAngleId: string,
  videoAngles: VideoAngles,
): BookValidationIssue[] => {
  const recommended = videoAngles.candidates.find((angle) => angle.recommended);
  if (!recommended || recommended.angleId === recommendedAngleId) return [];
  return [blockingIssue(
    "ANALYSIS_RECOMMENDED_ANGLE_MISMATCH",
    `book-analysis recommends ${recommendedAngleId}, but ${recommended.angleId} is the recommended candidate.`,
    "book-analysis.recommendedAngleId",
    [...recommended.claimIds],
    "Make recommendedAngleId match the sole recommended eligible candidate.",
  )];
};

export const validateBookArtifactGraph = ({
  bookSource,
  chapterAnalyses,
  synthesis,
  verificationRecords,
  videoAngles,
  selectedAngle,
  analysis,
}: BookArtifactGraph): BookValidationIssue[] => {
  const issues: BookValidationIssue[] = [];
  const claimsById = new Map<string, ClaimLike>();
  const evidenceById = new Map<string, EvidenceLike>();
  const chapterIds = new Set<string>();

  for (const chapter of chapterAnalyses) {
    if (chapterIds.has(chapter.chapterId)) {
      issues.push(blockingIssue(
        "DUPLICATE_CHAPTER_ANALYSIS_ID",
        `Chapter analysis id ${chapter.chapterId} is duplicated.`,
        chapter.chapterId,
        [],
        "Regenerate chapter analyses with globally unique chapter ids.",
      ));
    }
    chapterIds.add(chapter.chapterId);

    for (const claim of chapter.claims) {
      if (claimsById.has(claim.claimId)) {
        issues.push(blockingIssue(
          "DUPLICATE_CLAIM_ID",
          `Claim id ${claim.claimId} is duplicated across chapter artifacts.`,
          chapter.chapterId,
          [claim.claimId],
          "Regenerate the affected chapter analysis with globally unique Claim ids.",
        ));
      } else {
        claimsById.set(claim.claimId, claim);
      }
    }

    for (const evidence of chapter.evidence) {
      if (evidenceById.has(evidence.evidenceId)) {
        issues.push(blockingIssue(
          "DUPLICATE_EVIDENCE_ID",
          `Evidence id ${evidence.evidenceId} is duplicated across chapter artifacts.`,
          chapter.chapterId,
          [...evidence.supportsClaimIds],
          "Regenerate the affected chapter analysis with globally unique Evidence ids.",
        ));
      } else {
        evidenceById.set(evidence.evidenceId, evidence);
      }
    }
  }

  const claimIds = new Set(claimsById.keys());
  const evidenceIds = new Set(evidenceById.keys());
  issues.push(
    ...validateBookSourceRefs(bookSource, chapterAnalyses),
    ...validateEvidenceRefs(chapterAnalyses),
    ...validateSynthesisRefs(synthesis, claimIds, "MISSING_SYNTHESIS_CLAIM", "book-synthesis"),
    ...validateVerificationRefs(
      verificationRecords,
      claimIds,
      "MISSING_VERIFICATION_CLAIM",
      "verification",
    ),
    ...validateAngleRefs(videoAngles, claimIds),
    ...validateAngleInvariants(videoAngles, claimsById, verificationRecords, "video-angles"),
    ...validateKnownClaimIds(
      analysis.coreClaimIds,
      claimIds,
      "MISSING_ANALYSIS_CORE_CLAIM",
      "book-analysis",
    ),
    ...validateKnownClaimIds(
      analysis.verifiedClaimIds,
      claimIds,
      "MISSING_ANALYSIS_VERIFIED_CLAIM",
      "book-analysis",
    ),
    ...validateSynthesisRefs(
      analysis.synthesis,
      claimIds,
      "MISSING_ANALYSIS_SYNTHESIS_CLAIM",
      "book-analysis.synthesis",
    ),
    ...validateVerificationRefs(
      analysis.verificationRecords,
      claimIds,
      "MISSING_ANALYSIS_VERIFICATION_CLAIM",
      "book-analysis.verificationRecords",
    ),
    ...validateAngleRefs(analysis.videoAngles, claimIds),
    ...validateAngleInvariants(
      analysis.videoAngles,
      claimsById,
      analysis.verificationRecords,
      "book-analysis.videoAngles",
    ),
    ...validateAngleIdentity(
      analysis.recommendedAngleId,
      analysis.videoAngles,
      "MISSING_RECOMMENDED_ANGLE",
      "book-analysis.recommendedAngleId",
    ),
    ...validateRecommendedAngleId(analysis.recommendedAngleId, analysis.videoAngles),
  );

  if (selectedAngle) {
    issues.push(
      ...validateSelectedAngleRefs(selectedAngle, claimIds, evidenceIds),
      ...validateAngleIdentity(
        selectedAngle.angleId,
        videoAngles,
        "MISSING_SELECTED_ANGLE",
        "selected-angle",
      ),
      ...validateSelectedMatchesRecommended(selectedAngle, videoAngles, "selected-angle"),
    );
  }
  if (analysis.selectedAngle) {
    issues.push(
      ...validateSelectedAngleRefs(analysis.selectedAngle, claimIds, evidenceIds),
      ...validateAngleIdentity(
        analysis.selectedAngle.angleId,
        analysis.videoAngles,
        "MISSING_ANALYSIS_SELECTED_ANGLE",
        "book-analysis.selectedAngle",
      ),
      ...validateSelectedMatchesRecommended(
        analysis.selectedAngle,
        analysis.videoAngles,
        "book-analysis.selectedAngle",
      ),
    );
  }

  return issues;
};
