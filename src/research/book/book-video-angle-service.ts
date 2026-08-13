import {createHash} from "node:crypto";
import {z} from "zod";
import {readValidatedJson, writeValidatedJson} from "./artifact-store";
import {ArtifactMetaSchema, type BookSourceRef} from "./common-schema";
import type {IndependentAudit} from "./independent-audit-schema";
import type {InterrogativeDeepRead} from "./interrogative-deep-read-schema";
import type {ChapterAnalysis} from "./knowledge-schema";
import type {BookMap} from "./book-map-schema";
import type {WholeBookArgumentSynthesis} from "./whole-book-argument-synthesis-schema";
import type {BookVideoAngleInput, BookVideoAngleProvider} from "./book-video-angle-provider";
import {
  BookSelectedAngleSchema,
  BookVideoAngleDraftSetSchema,
  BookVideoAngleSchema,
  BookVideoAnglesSchema,
  type BookSelectedAngle,
  type BookVideoAngle,
  type BookVideoAngles,
} from "./book-video-angle-schema";

export const BOOK_VIDEO_ANGLE_PROMPT_VERSION = "book-video-angle-v2-quality-repair";
export const BOOK_VIDEO_ANGLE_SCHEMA_VERSION = "1.0.0";

const CacheSchema = z.object({
  artifact: ArtifactMetaSchema,
  provider: z.object({name: z.string().min(1), model: z.string().min(1)}),
  anglesHash: z.string().regex(/^[a-f0-9]{64}$/),
  selectedHash: z.string().regex(/^[a-f0-9]{64}$/),
});

interface Options {
  map: BookMap;
  synthesis: WholeBookArgumentSynthesis;
  audit: Pick<IndependentAudit, "videoReady" | "blockingIssues">;
  analyses: ChapterAnalysis[];
  deepReads: InterrogativeDeepRead[];
  provider: BookVideoAngleProvider;
  outputPath: string;
  selectedPath: string;
  cachePath: string;
  createdAt?: string;
}

export interface BookVideoAngleResult {
  angles: BookVideoAngles;
  selected: BookSelectedAngle;
  cacheHit: boolean;
}

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const refKey = (ref: Pick<BookSourceRef, "chapterId" | "page" | "blockId">): string => (
  `${ref.chapterId}:${ref.page}:${ref.blockId}`
);
const uniqueRefs = (refs: readonly BookSourceRef[]): BookSourceRef[] => [
  ...new Map(refs.map((ref) => [refKey(ref), ref])).values(),
];

const buildInput = (
  synthesis: WholeBookArgumentSynthesis,
  analyses: readonly ChapterAnalysis[],
  deepReads: readonly InterrogativeDeepRead[],
): BookVideoAngleInput => {
  const claims: BookVideoAngleInput["claims"] = analyses.filter((analysis) => analysis.quality.status === "PASS"
    && (analysis.quality.blockingIssues?.length ?? 0) === 0).flatMap((analysis) => analysis.claims
    .filter((claim) => claim.evidenceSupport === "strong"
      && (claim.verificationStatus === "verified" || claim.verificationStatus === "not_required"))
    .map((claim) => {
      const evidence = analysis.evidence.filter((item) => item.supportsClaimIds.includes(claim.claimId)
        && item.sourceRef.type === "book").map((item) => ({
        evidenceId: item.evidenceId,
        type: item.type,
        summary: item.summary,
        originalExcerpt: item.originalExcerpt,
        strength: item.strength,
        sourceRef: item.sourceRef as BookSourceRef,
      }));
      return {
        claimId: claim.claimId,
        chapterId: analysis.chapterId,
        statement: claim.statement,
        authorPosition: claim.authorPosition,
        scope: claim.scope,
        importance: claim.importance.score,
        evidence,
        sourceRefs: uniqueRefs([
          ...claim.bookEvidenceRefs,
          ...claim.sourceRefs.filter((ref): ref is BookSourceRef => ref.type === "book"),
          ...evidence.map((item) => item.sourceRef),
        ]),
      };
    }).filter((claim) => claim.evidence.length > 0));
  const known = new Set(claims.map((claim) => claim.claimId));
  const bundleDrafts: Array<Omit<BookVideoAngleInput["supportBundles"][number], "bundleId">> = [
    ...synthesis.coreThesis.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds, perspective: item.perspective})),
    ...synthesis.argumentMap.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds, perspective: item.perspective})),
    ...synthesis.crossChapterPatterns.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds, perspective: "system_synthesis" as const})),
    ...synthesis.tensions.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds, perspective: item.perspective})),
    ...synthesis.limitations.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds, perspective: item.perspective})),
    ...synthesis.practicalFrameworks.map((item) => ({statement: `${item.name}：${item.steps.join("；")}`, claimIds: item.supportingClaimIds, perspective: "system_synthesis" as const})),
    ...synthesis.readerTakeaways.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds, perspective: "system_synthesis" as const})),
    ...synthesis.relations.map((item) => ({
      statement: `${claims.find((claim) => claim.claimId === item.fromClaimId)?.statement ?? ""}；${item.relation}；${claims.find((claim) => claim.claimId === item.toClaimId)?.statement ?? ""}`,
      claimIds: [item.fromClaimId, item.toClaimId],
      perspective: "system_synthesis" as const,
    })),
  ];
  const supportBundles = [...new Map(bundleDrafts.map((item) => ({
    ...item,
    claimIds: [...new Set(item.claimIds.filter((claimId) => known.has(claimId)))],
  })).filter((item) => item.claimIds.length >= 2).map((item) => (
    [`${item.claimIds.slice().sort().join("|")}:${normalize(item.statement)}`, item] as const
  ))).values()].map((item, index) => ({...item, bundleId: `bundle-${String(index + 1).padStart(3, "0")}`}));
  return {
  supportBundles,
  synthesis: {
    coreTheses: synthesis.coreThesis.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds})),
    tensions: synthesis.tensions.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds})),
    limitations: synthesis.limitations.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds})),
    practicalFrameworks: synthesis.practicalFrameworks.map((item) => ({name: item.name, steps: item.steps, claimIds: item.supportingClaimIds})),
    readerTakeaways: synthesis.readerTakeaways.map((item) => ({statement: item.statement, claimIds: item.supportingClaimIds})),
  },
  claims,
  deepReadCritiques: deepReads.map((item) => ({
    chapterId: item.chapterId,
    evidenceLimits: item.evidenceLimits,
    causalAssessment: item.causalAssessment,
    counterpoints: item.counterpoints,
    contradictions: item.contradictions,
    scopeCorrections: item.scopeCorrections,
    finalJudgment: item.finalJudgment,
  })),
  };
};

const score = (angle: BookVideoAngle): number => {
  const positive = angle.audienceRelevance * 0.12
    + angle.practicalValue * 0.12
    + angle.counterIntuitiveScore * 0.1
    + angle.evidenceStrength * 0.16
    + angle.narrativePotential * 0.14
    + angle.saveValue * 0.1
    + angle.originalInsight * 0.12
    + angle.titleIntegrityScore * 0.14;
  const penalty = angle.faithfulnessPenalty * 0.25
    + angle.overclaimPenalty * 0.35
    + angle.evidencePenalty * 0.4;
  return Math.max(0, Math.min(100, Math.round(positive - penalty)));
};

const normalize = (value: string): string => value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const features = (value: string): Set<string> => {
  const text = normalize(value);
  const result = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) result.add(text.slice(index, index + 2));
  return result;
};
const semanticCoverage = (statement: string, support: string): number => {
  const wanted = features(statement);
  if (wanted.size === 0) return 0;
  const available = features(support);
  return [...wanted].filter((item) => available.has(item)).length / wanted.size;
};
const numericTokens = (value: string): string[] => value.normalize("NFKC").match(/\d+(?:\.\d+)?%?/gu) ?? [];
const causalLanguage = /(导致|造成|决定|必然|因此产生|使得|引发|促使|推动|带来|致使|源于|归因于)/u;

const validateAndRank = (raw: unknown, input: BookVideoAngleInput): BookVideoAngles => {
  const drafts = BookVideoAngleDraftSetSchema.parse(raw).candidates;
  const claims = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const evidence = new Map(input.claims.flatMap((claim) => claim.evidence.map((item) => [item.evidenceId, item] as const)));
  const deduplicated = new Map<string, BookVideoAngle>();
  const rejections: string[] = [];
  for (const draft of drafts) {
    const claimIds = [...new Set(draft.coreClaimIds)];
    const evidenceIds = [...new Set(draft.evidenceIds)];
    const sourceRefs = uniqueRefs(draft.sourceRefs);
    const knownClaims = claimIds.every((claimId) => claims.has(claimId));
    const knownEvidence = evidenceIds.every((evidenceId) => evidence.has(evidenceId));
    const evidenceStrength = knownEvidence
      ? Math.round(evidenceIds.reduce((total, evidenceId) => total + evidence.get(evidenceId)!.strength, 0)
        / evidenceIds.length * 100)
      : 0;
    const evidenceSupportsClaims = evidenceIds.every((evidenceId) => {
      const owner = input.claims.find((claim) => claim.evidence.some((item) => item.evidenceId === evidenceId));
      return owner !== undefined && claimIds.includes(owner.claimId);
    });
    const allowedRefKeys = new Set(claimIds.flatMap((claimId) => claims.get(claimId)?.sourceRefs ?? []).map(refKey));
    const refsValid = sourceRefs.every((ref) => allowedRefKeys.has(refKey(ref)));
    const bundleBacked = input.supportBundles.some((bundle) => claimIds.every((claimId) => bundle.claimIds.includes(claimId)));
    const angleText = `${draft.title}\n${draft.centralQuestion}\n${draft.thesis}`;
    const supportText = claimIds.flatMap((claimId) => {
      const claim = claims.get(claimId);
      return claim ? [
        claim.statement,
        claim.authorPosition,
        ...claim.scope.appliesTo,
        ...claim.evidence.flatMap((item) => [item.summary, item.originalExcerpt]),
      ] : [];
    }).join("\n");
    const supportNumbers = new Set(numericTokens(supportText));
    const contentSupported = semanticCoverage(angleText, supportText) >= 0.12
      && numericTokens(angleText).every((token) => supportNumbers.has(token))
      && (!causalLanguage.test(angleText) || causalLanguage.test(supportText));
    const everyClaimSupportsAngle = claimIds.every((claimId) => {
      const claim = claims.get(claimId);
      if (!claim) return false;
      const claimSupport = [
        claim.statement,
        claim.authorPosition,
        ...claim.scope.appliesTo,
        ...claim.evidence.flatMap((item) => [item.summary, item.originalExcerpt]),
      ].join("\n");
      return semanticCoverage(angleText, claimSupport) >= 0.08;
    });
    const reasons = [
      !draft.eligible && "MODEL_MARKED_INELIGIBLE",
      claimIds.length < 2 && "INSUFFICIENT_CORE_CLAIMS",
      evidenceIds.length < 2 && "INSUFFICIENT_EVIDENCE",
      sourceRefs.length < 2 && "INSUFFICIENT_SOURCE_REFS",
      !knownClaims && "DANGLING_CLAIM",
      !knownEvidence && "DANGLING_EVIDENCE",
      !evidenceSupportsClaims && "EVIDENCE_NOT_LINKED_TO_CORE_CLAIM",
      !refsValid && "DANGLING_SOURCE_REF",
      !bundleBacked && "CLAIMS_OUTSIDE_SUPPORT_BUNDLE",
      !contentSupported && "TITLE_THESIS_NOT_SUPPORTED",
      !everyClaimSupportsAngle && "CORE_CLAIM_NOT_RELEVANT",
      !/[？?]$/u.test(draft.centralQuestion.trim()) && "CENTRAL_QUESTION_NOT_A_QUESTION",
      draft.titleIntegrityScore < 70 && "LOW_TITLE_INTEGRITY",
      evidenceStrength < 65 && "LOW_REAL_EVIDENCE_STRENGTH",
      draft.faithfulnessPenalty >= 40 && "HIGH_FAITHFULNESS_PENALTY",
      draft.overclaimPenalty >= 40 && "HIGH_OVERCLAIM_PENALTY",
      draft.evidencePenalty >= 40 && "HIGH_EVIDENCE_PENALTY",
    ].filter((reason): reason is string => Boolean(reason));
    if (reasons.length > 0) {
      rejections.push(`${draft.angleId}:${reasons.join(",")}`);
      continue;
    }
    const normalized = BookVideoAngleSchema.parse({
      ...draft,
      coreClaimIds: claimIds,
      evidenceIds,
      sourceRefs,
      evidenceStrength,
      eligible: true,
      overallScore: 0,
    });
    const candidate = BookVideoAngleSchema.parse({...normalized, overallScore: score(normalized)});
    const key = normalize(candidate.centralQuestion);
    const previous = deduplicated.get(key);
    if (!previous || candidate.overallScore > previous.overallScore) deduplicated.set(key, candidate);
  }
  const candidates = [...deduplicated.values()]
    .sort((left, right) => right.overallScore - left.overallScore || left.angleId.localeCompare(right.angleId))
    .slice(0, 5);
  if (candidates.length < 3) {
    throw new Error(`INSUFFICIENT_ELIGIBLE_ANGLES survived=${candidates.length}; ${rejections.join("; ")}`);
  }
  return BookVideoAnglesSchema.parse({candidates});
};

const readReusable = async (input: BookVideoAngleInput, options: Options): Promise<BookVideoAngleResult | null> => {
  try {
    const angles = await readValidatedJson(options.outputPath, BookVideoAnglesSchema);
    const selected = await readValidatedJson(options.selectedPath, BookSelectedAngleSchema);
    const cache = await readValidatedJson(options.cachePath, CacheSchema);
    if (cache.artifact.inputHash !== hash(input)
      || cache.artifact.promptVersion !== BOOK_VIDEO_ANGLE_PROMPT_VERSION
      || cache.artifact.schemaVersion !== BOOK_VIDEO_ANGLE_SCHEMA_VERSION
      || cache.artifact.modelProfile !== `${options.provider.provider}:${options.provider.model}`
      || cache.provider.name !== options.provider.provider
      || cache.provider.model !== options.provider.model
      || cache.anglesHash !== hash(angles)
      || cache.selectedHash !== hash(selected)) return null;
    const validated = validateAndRank({candidates: angles.candidates.concat(
      Array.from({length: 8 - angles.candidates.length}, (_, index) => ({
        ...angles.candidates.at(-1)!, angleId: `angle-cache-${index}`,
      })),
    )}, input);
    if (hash(validated) !== hash(angles) || selected.angleId !== angles.candidates[0]!.angleId) return null;
    return {angles, selected, cacheHit: true};
  } catch {
    return null;
  }
};

export const createOrReuseBookVideoAngles = async (options: Options): Promise<BookVideoAngleResult> => {
  if (!options.audit.videoReady || options.audit.blockingIssues.length > 0) {
    throw new Error("AUDIT_NOT_VIDEO_READY Independent audit must be PASS with zero blockers");
  }
  void options.map;
  const input = buildInput(options.synthesis, options.analyses, options.deepReads);
  if (input.claims.length < 2) throw new Error("INSUFFICIENT_RELIABLE_CLAIMS");
  const reusable = await readReusable(input, options);
  if (reusable) return reusable;
  let raw = await options.provider.generateAngles(input);
  let angles: BookVideoAngles;
  try {
    angles = validateAndRank(raw, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith("INSUFFICIENT_ELIGIBLE_ANGLES")) throw error;
    raw = await options.provider.generateAngles(input, [message]);
    angles = validateAndRank(raw, input);
  }
  const selected = BookSelectedAngleSchema.parse({...angles.candidates[0], targetDurationSec: 300});
  await writeValidatedJson(options.outputPath, BookVideoAnglesSchema, angles);
  await writeValidatedJson(options.selectedPath, BookSelectedAngleSchema, selected);
  await writeValidatedJson(options.cachePath, CacheSchema, {
    artifact: {
      inputHash: hash(input),
      promptVersion: BOOK_VIDEO_ANGLE_PROMPT_VERSION,
      modelProfile: `${options.provider.provider}:${options.provider.model}`,
      schemaVersion: BOOK_VIDEO_ANGLE_SCHEMA_VERSION,
      createdAt: options.createdAt ?? new Date().toISOString(),
    },
    provider: {name: options.provider.provider, model: options.provider.model},
    anglesHash: hash(angles),
    selectedHash: hash(selected),
  });
  return {angles, selected, cacheHit: false};
};
