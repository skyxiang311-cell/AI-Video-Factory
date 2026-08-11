import type {BookSourceRef, SourceRef} from "./common-schema";

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

type VideoAngleLike = {
  angleId: string;
  claimIds?: readonly string[];
};

type VideoAnglesLike = {candidates: readonly VideoAngleLike[]} | readonly VideoAngleLike[];

type SelectedAngleLike = {
  angleId: string;
  mustInclude: {
    claims: readonly string[];
    evidence: readonly string[];
  };
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
  videoAngles: VideoAnglesLike,
  knownClaimIds: ReadonlySet<string> | readonly string[],
): BookValidationIssue[] => {
  const claims = knownIds(knownClaimIds);
  const candidates = "candidates" in videoAngles ? videoAngles.candidates : videoAngles;
  const issues: BookValidationIssue[] = [];

  for (const angle of candidates) {
    for (const claimId of angle.claimIds ?? []) {
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
