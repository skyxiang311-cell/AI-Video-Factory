import {
  ChapterAnalysisSchema,
  type ChapterAnalysis,
  type Claim,
  type Evidence,
} from "./knowledge-schema";

export type ClaimEvidenceQualityIssueCode =
  | "UNSUPPORTED_CLAIM"
  | "WEAK_CLAIM_REQUIRES_REVISION"
  | "PARTIAL_SUPPORT_SCOPE_OVERCLAIM"
  | "SEVERE_EXCERPT_MISMATCH"
  | "CAUSAL_OVERCLAIM"
  | "CORE_CLAIM_WITHOUT_DIRECT_EVIDENCE"
  | "EVIDENCE_CLAIM_MISMATCH"
  | "EVIDENCE_SUMMARY_EXCERPT_MISMATCH"
  | "FRAGMENTARY_CLAIM"
  | "SCOPE_OVERCLAIM";

export interface ClaimEvidenceQualityIssue {
  code: ClaimEvidenceQualityIssueCode;
  claimId: string;
  evidenceId?: string;
  message: string;
  blocking: true;
}

export interface ClaimEvidenceQualityResult {
  analysis: ChapterAnalysis;
  blockingIssues: ClaimEvidenceQualityIssue[];
}

export interface EnforcedClaimEvidenceQualityResult extends ClaimEvidenceQualityResult {
  unsupportedClaimsRemoved: number;
  causalOverclaimsCorrected: number;
}

type EvidenceSupport = "strong" | "partial" | "weak" | "unsupported";

const supportRank: Record<EvidenceSupport, number> = {
  unsupported: 0,
  weak: 1,
  partial: 2,
  strong: 3,
};

const normalize = (value: string): string => value
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]/gu, "");

const numericTokens = (value: string): string[] => (
  value.normalize("NFKC").match(/\d+(?:\.\d+)?%?/gu) ?? []
);

const semanticFeatures = (value: string): Set<string> => {
  const normalized = normalize(value);
  const features = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    features.add(normalized.slice(index, index + 2));
  }
  for (const token of value.normalize("NFKC").toLowerCase().match(/[a-z]{3,}|\d+(?:\.\d+)?%?/gu) ?? []) {
    features.add(token);
  }
  return features;
};

const semanticCoverage = (statement: string, excerpt: string): number => {
  const claimFeatures = semanticFeatures(statement);
  if (claimFeatures.size === 0) return 0;
  const excerptFeatures = semanticFeatures(excerpt);
  let overlap = 0;
  for (const feature of claimFeatures) {
    if (excerptFeatures.has(feature)) overlap += 1;
  }
  return overlap / claimFeatures.size;
};

const hasNumericMismatch = (statement: string, excerpt: string): boolean => {
  const excerptNumbers = new Set(numericTokens(excerpt));
  return numericTokens(statement).some((number) => !excerptNumbers.has(number));
};

const negation = /(不(?:可|能|会|是|应|得)?|没有|未曾|未|无(?:法|关)?|并非|否认)/gu;
const negationCount = (value: string): number => value.match(negation)?.length ?? 0;
const hasNegationMismatch = (statement: string, excerpt: string): boolean => (
  (negationCount(statement) === 0) !== (negationCount(excerpt) === 0)
);

const lexicalSupport = (statement: string, excerpt: string): EvidenceSupport => {
  if (
    !excerpt.trim()
    || hasNumericMismatch(statement, excerpt)
    || hasNegationMismatch(statement, excerpt)
  ) return "unsupported";
  const coverage = semanticCoverage(statement, excerpt);
  if (coverage >= 0.28) return "strong";
  if (coverage >= 0.16) return "partial";
  if (coverage >= 0.07) return "weak";
  return "unsupported";
};

const fragmentaryStart = /^(?:而|但|可能发生的|出特点是|该数值|问题是|所以|因此|从而|其(?:中|后)?)[，,\s]/u;
const fragmentaryEnd = /[，,、；;：:]$/u;
const isFragmentaryClaim = (statement: string): boolean => {
  const trimmed = statement.trim();
  return trimmed.length < 8 || fragmentaryStart.test(trimmed) || fragmentaryEnd.test(trimmed);
};

const lowerSupport = (left: EvidenceSupport, right: EvidenceSupport): EvidenceSupport => (
  supportRank[left] <= supportRank[right] ? left : right
);

const causalClaim = /(导致|造成|决定|必然|因此产生|主要原因|使得|引发|促使|推动|带来|致使|源于|归因于|因为|由于|所以|因而|从而)/u;
const partialLanguage = /(作者认为|可能|一定程度|在.{1,40}(?:范围|条件|情境|时期|群体|社会|地区)|与.{1,30}(?:相关|有关)|仅|部分|截至|根据)/u;
const genericScope = /^(?:贫富差距|社会分层|相关问题|相关情境|一般情况|本章内容)$/u;
const universalScope = /(所有|全部|任何|一切|各国|全世界|普遍适用|不限(?:国家|时期|群体|地区))/u;
const boundaryScope = /(其他|非|之外|未|没有|不包括|不适用|条件不明|不同)/u;

interface CausalRelation {cause: string; effect: string}
const extractCausalRelation = (value: string): CausalRelation | null => {
  const direct = value.match(/^(.{2,120}?)(?:导致|造成|决定|使得|因此产生|引发|促使|推动|带来|致使)(.{2,120})$/u);
  if (direct) return {cause: direct[1]!, effect: direct[2]!};
  const reverse = value.match(/^(.{2,120}?)(?:源于|归因于)(.{2,120})$/u);
  if (reverse) return {cause: reverse[2]!, effect: reverse[1]!};
  const because = value.match(/(?:因为|由于)(.{2,120}?)(?:所以|因而|从而|，|,)(.{2,120})$/u);
  return because ? {cause: because[1]!, effect: because[2]!} : null;
};

const causalDirectionSupported = (statement: string, excerpts: readonly string[]): boolean => {
  if (!causalClaim.test(statement)) return true;
  const claimRelation = extractCausalRelation(statement);
  if (!claimRelation) return false;
  return excerpts.some((excerpt) => {
    const evidenceRelation = extractCausalRelation(excerpt);
    if (!evidenceRelation) return false;
    return semanticCoverage(claimRelation.cause, evidenceRelation.cause) >= 0.16
      && semanticCoverage(claimRelation.effect, evidenceRelation.effect) >= 0.16;
  });
};

const scopeIssues = (claim: Claim, combinedExcerpt: string): boolean => {
  const grounding = combinedExcerpt;
  const appliesIssue = claim.scope.appliesTo.some((scope) => (
    (universalScope.test(scope) && !universalScope.test(grounding))
    || (normalize(scope).length >= 8 && semanticCoverage(scope, grounding) < 0.07)
  ));
  const boundaryIssue = claim.scope.doesNotNecessarilyApplyTo.some((scope) => (
    universalScope.test(scope) || !boundaryScope.test(scope)
  ));
  return appliesIssue || boundaryIssue;
};

const isPartialNarrowed = (claim: Claim): boolean => (
  partialLanguage.test(claim.statement)
  || claim.scope.appliesTo.some((scope) => (
    normalize(scope).length >= 8 && !genericScope.test(scope.trim())
  ))
);

const issue = (
  code: ClaimEvidenceQualityIssueCode,
  claimId: string,
  message: string,
  evidenceId?: string,
): ClaimEvidenceQualityIssue => ({code, claimId, evidenceId, message, blocking: true});

const directEvidenceFor = (claim: Claim, evidence: readonly Evidence[]): Evidence[] => (
  evidence.filter((item) => item.supportsClaimIds.includes(claim.claimId))
);

export const calibrateChapterClaimEvidenceQuality = (
  rawAnalysis: ChapterAnalysis,
): ClaimEvidenceQualityResult => {
  const parsed = ChapterAnalysisSchema.parse(rawAnalysis);
  const issues: ClaimEvidenceQualityIssue[] = [];
  const claims = parsed.claims.map((claim) => {
    const directEvidence = directEvidenceFor(claim, parsed.evidence);
    if (directEvidence.length === 0) {
      issues.push(issue(
        "CORE_CLAIM_WITHOUT_DIRECT_EVIDENCE",
        claim.claimId,
        `${claim.claimId} has no directly linked Evidence.`,
      ));
    }

    const usableEvidence: Evidence[] = [];
    for (const evidence of directEvidence) {
      const pairSupport = lexicalSupport(claim.statement, evidence.originalExcerpt);
      if (pairSupport === "unsupported") {
        issues.push(issue(
          "SEVERE_EXCERPT_MISMATCH",
          claim.claimId,
          `${evidence.evidenceId} excerpt does not semantically support ${claim.claimId}.`,
          evidence.evidenceId,
        ));
        issues.push(issue(
          "EVIDENCE_CLAIM_MISMATCH",
          claim.claimId,
          `${evidence.evidenceId} must not list ${claim.claimId} in supportsClaimIds.`,
          evidence.evidenceId,
        ));
      } else {
        usableEvidence.push(evidence);
      }
      const summarySupport = lexicalSupport(evidence.summary, evidence.originalExcerpt);
      if (supportRank[summarySupport] < supportRank.strong) {
        issues.push(issue(
          "EVIDENCE_SUMMARY_EXCERPT_MISMATCH",
          claim.claimId,
          `${evidence.evidenceId} summary exceeds or does not match its exact source excerpt.`,
          evidence.evidenceId,
        ));
      }
    }

    const combinedExcerpt = usableEvidence.map((evidence) => evidence.originalExcerpt).join("\n");
    const measured = usableEvidence.length === 0
      ? "unsupported"
      : lexicalSupport(claim.statement, combinedExcerpt);
    const declared = claim.evidenceSupport ?? measured;
    const evidenceSupport = lowerSupport(declared, measured);

    if (evidenceSupport === "unsupported") {
      issues.push(issue(
        "UNSUPPORTED_CLAIM",
        claim.claimId,
        `${claim.claimId} is unsupported and cannot enter final ChapterAnalysis.`,
      ));
    } else if (evidenceSupport === "weak") {
      issues.push(issue(
        "WEAK_CLAIM_REQUIRES_REVISION",
        claim.claimId,
        `${claim.claimId} is weak; narrow its statement or scope to direct excerpt support.`,
      ));
    } else if (evidenceSupport === "partial" && !isPartialNarrowed(claim)) {
      issues.push(issue(
        "PARTIAL_SUPPORT_SCOPE_OVERCLAIM",
        claim.claimId,
        `${claim.claimId} has partial support but no explicit statement/scope limitation.`,
      ));
    }

    if (!causalDirectionSupported(
      claim.statement,
      usableEvidence.map((evidence) => evidence.originalExcerpt),
    )) {
      issues.push(issue(
        "CAUSAL_OVERCLAIM",
        claim.claimId,
        `${claim.claimId} uses causal language without explicit causal evidence; use association language.`,
      ));
    }

    if (scopeIssues(claim, combinedExcerpt)) {
      issues.push(issue(
        "SCOPE_OVERCLAIM",
        claim.claimId,
        `${claim.claimId} scope is broader than or unrelated to its direct Evidence.`,
      ));
    }

    if (isFragmentaryClaim(claim.statement)) {
      issues.push(issue(
        "FRAGMENTARY_CLAIM",
        claim.claimId,
        `${claim.claimId} is a truncated source fragment rather than a complete supported Claim.`,
      ));
    }

    return {...claim, evidenceSupport};
  });

  const blockingMessages = issues.map(({code, claimId, evidenceId, message}) => (
    `${code} ${claimId}${evidenceId ? ` ${evidenceId}` : ""}: ${message}`
  ));
  const analysis = ChapterAnalysisSchema.parse({
    ...parsed,
    claims,
    quality: {
      ...parsed.quality,
      status: issues.length === 0 ? "PASS" : "NEEDS_REVIEW",
      blockingIssues: blockingMessages,
    },
  });
  return {analysis, blockingIssues: issues};
};

export const enforceChapterClaimEvidenceQuality = (
  rawAnalysis: ChapterAnalysis,
  pass = 0,
): EnforcedClaimEvidenceQualityResult => {
  const initial = calibrateChapterClaimEvidenceQuality(rawAnalysis);
  const unsupportedClaims = new Set(initial.blockingIssues
    .filter((item) => item.code === "UNSUPPORTED_CLAIM")
    .map((item) => item.claimId));
  const irreparableClaims = new Set(initial.blockingIssues
    .filter((item) => (
      item.code === "WEAK_CLAIM_REQUIRES_REVISION"
      || item.code === "PARTIAL_SUPPORT_SCOPE_OVERCLAIM"
      || item.code === "SCOPE_OVERCLAIM"
      || item.code === "CAUSAL_OVERCLAIM"
      || item.code === "FRAGMENTARY_CLAIM"
    ))
    .map((item) => item.claimId));
  for (const claimId of unsupportedClaims) irreparableClaims.delete(claimId);
  const mismatchedPairs = new Set(initial.blockingIssues
    .filter((item) => (
      (item.code === "SEVERE_EXCERPT_MISMATCH"
        || item.code === "EVIDENCE_SUMMARY_EXCERPT_MISMATCH")
      && item.evidenceId
    ))
    .map((item) => `${item.claimId}:${item.evidenceId}`));

  const claims = initial.analysis.claims
    .filter((claim) => (
      !unsupportedClaims.has(claim.claimId)
      && !irreparableClaims.has(claim.claimId)
    ));
  const keptClaimIds = new Set(claims.map((claim) => claim.claimId));
  const evidence = initial.analysis.evidence
    .map((item) => ({
      ...item,
      supportsClaimIds: item.supportsClaimIds.filter((claimId) => (
        keptClaimIds.has(claimId)
        && !mismatchedPairs.has(`${claimId}:${item.evidenceId}`)
      )),
    }))
    .filter((item) => item.supportsClaimIds.length > 0);
  const repaired = ChapterAnalysisSchema.parse({
    ...initial.analysis,
    claims,
    evidence,
    quality: {
      confidence: initial.analysis.quality.confidence,
      status: "PASS",
      blockingIssues: [],
    },
  });
  const final = calibrateChapterClaimEvidenceQuality(repaired);
  const newlyUnsupported = final.blockingIssues.some((item) => (
    item.code === "UNSUPPORTED_CLAIM"
    || item.code === "CORE_CLAIM_WITHOUT_DIRECT_EVIDENCE"
  ));
  if (newlyUnsupported && pass < 2) {
    const next = enforceChapterClaimEvidenceQuality(final.analysis, pass + 1);
    return {
      ...next,
      unsupportedClaimsRemoved: unsupportedClaims.size + next.unsupportedClaimsRemoved,
      causalOverclaimsCorrected: next.causalOverclaimsCorrected,
    };
  }
  return {
    ...final,
    unsupportedClaimsRemoved: unsupportedClaims.size + irreparableClaims.size,
    causalOverclaimsCorrected: 0,
  };
};
