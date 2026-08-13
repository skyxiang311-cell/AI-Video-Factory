import {createHash} from "node:crypto";
import {rm} from "node:fs/promises";
import {resolve} from "node:path";
import {z} from "zod";
import {BookMapSchema, type BookMap} from "./book-map-schema";
import type {
  ChapterDeepReadBlock,
  ChapterDeepReadInput,
  ChapterDeepReadProvider,
} from "./chapter-deep-read-provider";
import {ChapterDeepReadOutputError} from "./chapter-deep-read-provider";
import {
  calibrateChapterClaimEvidenceQuality,
  enforceChapterClaimEvidenceQuality,
  type ClaimEvidenceQualityIssue,
} from "./chapter-evidence-quality";
import {readValidatedJson, writeValidatedJson} from "./artifact-store";
import {ArtifactMetaSchema, type BookSourceRef} from "./common-schema";
import {ChapterAnalysisSchema, type ChapterAnalysis} from "./knowledge-schema";
import {BookSourceSchema, type BookSource} from "./source-schema";
import {validateBookSourceRefs, validateEvidenceRefs} from "./traceability";

export const CHAPTER_DEEP_READ_PROMPT_VERSION = "claim-first-chapter-v5-entailment-scoped";
export const CHAPTER_DEEP_READ_SCHEMA_VERSION = "1.0.0";
const MINIMUM_CHAPTER_BLOCK_CONFIDENCE = 0.85;

const CacheSchema = z.object({
  artifact: ArtifactMetaSchema,
  provider: z.object({name: z.string().min(1), model: z.string().min(1)}),
  analysisHash: z.string().regex(/^[a-f0-9]{64}$/),
});

const NeedsReviewSchema = z.object({
  chapterId: z.string().regex(/^chapter-[a-z0-9-]+$/),
  status: z.literal("NEEDS_REVIEW"),
  attempts: z.literal(2),
  provider: z.object({name: z.string().min(1), model: z.string().min(1)}),
  issues: z.array(z.string().min(1)).min(1),
  candidate: ChapterAnalysisSchema.optional(),
  createdAt: z.string().datetime(),
});

interface CreateOptions {
  source: BookSource;
  map: BookMap;
  chaptersDirectory: string;
  provider: ChapterDeepReadProvider;
  createdAt?: string;
}

export interface ChapterDeepReadResult {
  analyses: ChapterAnalysis[];
  cacheHits: Record<string, boolean>;
  blockingTraceabilityIssues: string[];
  needsReview: string[];
  unsupportedClaimsRemoved: number;
  causalOverclaimsCorrected: number;
}

const contentHash = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");

const referenceKey = (reference: Pick<BookSourceRef, "chapterId" | "page" | "blockId">): string => (
  `${reference.chapterId}:${reference.page}:${reference.blockId}`
);

const buildTargetInput = (
  source: BookSource,
  map: BookMap,
  chapterId: string,
): ChapterDeepReadInput => {
  const target = map.phase3BTargets.find((item) => item.chapterId === chapterId);
  const mapped = map.chapters.find((item) => item.chapterId === chapterId);
  const sourceChapter = source.structure.chapters.find((item) => item.chapterId === chapterId);
  if (!target || !mapped || !sourceChapter) {
    throw new Error(`Unknown Phase 3B target chapter: ${chapterId}`);
  }
  const lowConfidencePages = new Set(
    source.extractionQuality.lowConfidencePages.map((item) => item.page),
  );
  const blocks: ChapterDeepReadBlock[] = source.pages.flatMap((page) => (
    lowConfidencePages.has(page.page)
      ? []
      : page.contentBlocks.filter((block) => (
        block.chapterId === chapterId && block.confidence >= MINIMUM_CHAPTER_BLOCK_CONFIDENCE
      )).map((block) => ({
        blockId: block.blockId,
        page: block.page,
        chapterId: block.chapterId,
        type: block.type,
        originalText: block.originalText,
        language: block.language,
        confidence: block.confidence,
      }))
  ));
  if (blocks.length === 0) {
    throw new Error(`Phase 3B target has no eligible high-confidence blocks: ${chapterId}`);
  }
  return {
    chapterId,
    title: sourceChapter.title,
    chapterRole: mapped.role,
    chapterSummary: mapped.summary,
    importance: mapped.importance,
    targetPriority: target.priority,
    targetReason: target.reason,
    chapterCatalog: map.chapters.map(({chapterId: id, title}) => ({chapterId: id, title})),
    blocks,
  };
};

const genericScope = /^(?:适用范围|不适用范围|本章内容|相关情境|其他情境|一般情况)$/u;

const chapterQualityIssues = (
  analysis: ChapterAnalysis,
  input: ChapterDeepReadInput,
): string[] => {
  const issues: string[] = [];
  if (analysis.claims.length === 0) issues.push(`${input.chapterId}: requires at least one Claim`);
  if (analysis.evidence.length === 0) issues.push(`${input.chapterId}: requires at least one Evidence`);
  for (const claim of analysis.claims) {
    const scopeValues = [...claim.scope.appliesTo, ...claim.scope.doesNotNecessarilyApplyTo];
    if (scopeValues.some((value) => genericScope.test(value.trim()))) {
      issues.push(`${input.chapterId}:${claim.claimId}: scope template is not specific`);
    }
    if (!claim.sourceRefs.every((reference) => reference.type === "book")) {
      issues.push(`${input.chapterId}:${claim.claimId}: external source ref is forbidden in Phase 3B-1`);
    }
    if (claim.verificationStatus === "verified" || claim.verificationStatus === "unverified") {
      issues.push(`${input.chapterId}:${claim.claimId}: external verification status is forbidden in Phase 3B-1`);
    }
  }
  return issues;
};

const repeatedClaimIssues = (analyses: readonly ChapterAnalysis[]): string[] => {
  const issues: string[] = [];
  const statementOwners = new Map<string, string>();
  for (const analysis of analyses) {
    for (const claim of analysis.claims) {
      const normalized = claim.statement.replace(/[\s，。；：、“”‘’]/gu, "").toLowerCase();
      const existing = statementOwners.get(normalized);
      if (existing && existing !== analysis.chapterId) {
        issues.push(`Claim repeated across chapters: ${existing} and ${analysis.chapterId}`);
      } else {
        statementOwners.set(normalized, analysis.chapterId);
      }
    }
  }
  return issues;
};

export const validateChapterAnalysisSet = (
  analyses: readonly ChapterAnalysis[],
): string[] => {
  const issues: string[] = [];
  for (const analysis of analyses) {
    const placeholderInput = {
      chapterId: analysis.chapterId,
      blocks: [],
    } as unknown as ChapterDeepReadInput;
    issues.push(...chapterQualityIssues(analysis, placeholderInput));
  }
  if (new Set(analyses.flatMap((analysis) => (
    analysis.evidence.map((evidence) => evidence.type)
  ))).size < 2) {
    issues.push("Chapter analysis set requires at least 2 evidence types");
  }
  issues.push(...repeatedClaimIssues(analyses));
  return issues;
};

const normalizeAndValidate = (
  source: BookSource,
  input: ChapterDeepReadInput,
  providerOutput: ChapterAnalysis,
): {
  analysis: ChapterAnalysis;
  blockingIssues: string[];
  claimEvidenceIssues: ClaimEvidenceQualityIssue[];
  unsupportedClaimsRemoved: number;
  causalOverclaimsCorrected: number;
} => {
  const knownBlocks = new Map(input.blocks.map((block) => [
    referenceKey(block),
    block,
  ]));
  const normalized = ChapterAnalysisSchema.parse({
    ...providerOutput,
    chapterId: input.chapterId,
    title: input.title,
    importance: {
      ...providerOutput.importance,
      score: input.importance,
      reason: input.targetReason,
    },
    evidence: providerOutput.evidence.map((evidence) => {
      if (evidence.sourceRef.type !== "book") return evidence;
      const block = knownBlocks.get(referenceKey(evidence.sourceRef));
      return block ? {...evidence, originalExcerpt: block.originalText} : evidence;
    }),
  });

  const initialCalibration = calibrateChapterClaimEvidenceQuality(normalized);
  const calibrated = enforceChapterClaimEvidenceQuality(normalized);
  const analysis = calibrated.analysis;
  const traceability = [
    ...validateBookSourceRefs(source, [analysis]),
    ...validateEvidenceRefs([analysis]),
  ].filter((issue) => issue.blocking);
  const eligibilityIssues: string[] = [];
  for (const claim of analysis.claims) {
    const references = [
      ...claim.bookEvidenceRefs,
      ...claim.sourceRefs.filter((reference): reference is BookSourceRef => reference.type === "book"),
    ];
    for (const reference of references) {
      if (reference.chapterId !== input.chapterId || !knownBlocks.has(referenceKey(reference))) {
        eligibilityIssues.push(
          `INELIGIBLE_CHAPTER_REF ${claim.claimId} ${referenceKey(reference)}`,
        );
      }
    }
  }
  for (const evidence of analysis.evidence) {
    if (
      evidence.sourceRef.type !== "book"
      || evidence.sourceRef.chapterId !== input.chapterId
      || !knownBlocks.has(referenceKey(evidence.sourceRef))
    ) {
      eligibilityIssues.push(`INELIGIBLE_EVIDENCE_REF ${evidence.evidenceId}`);
    }
  }
  const issues = [
    ...traceability.map((issue) => `${issue.code}: ${issue.message}`),
    ...eligibilityIssues,
    ...chapterQualityIssues(analysis, input),
    ...calibrated.blockingIssues.map(({code, claimId, evidenceId, message}) => (
      `${code} ${claimId}${evidenceId ? ` ${evidenceId}` : ""}: ${message}`
    )),
  ];
  if (issues.length > 0) {
    issues.push(...initialCalibration.blockingIssues.map(({code, claimId, evidenceId, message}) => (
      `${code} ${claimId}${evidenceId ? ` ${evidenceId}` : ""}: ${message}`
    )));
  }
  return {
    analysis,
    blockingIssues: issues,
    claimEvidenceIssues: initialCalibration.blockingIssues,
    unsupportedClaimsRemoved: calibrated.unsupportedClaimsRemoved,
    causalOverclaimsCorrected: calibrated.causalOverclaimsCorrected,
  };
};

const readReusable = async (
  source: BookSource,
  input: ChapterDeepReadInput,
  outputPath: string,
  cachePath: string,
  expected: {inputHash: string; modelProfile: string; provider: string; model: string},
): Promise<ChapterAnalysis | null> => {
  try {
    const analysis = await readValidatedJson(outputPath, ChapterAnalysisSchema);
    const cache = await readValidatedJson(cachePath, CacheSchema);
    if (
      cache.artifact.inputHash !== expected.inputHash
      || cache.artifact.promptVersion !== CHAPTER_DEEP_READ_PROMPT_VERSION
      || cache.artifact.schemaVersion !== CHAPTER_DEEP_READ_SCHEMA_VERSION
      || cache.artifact.modelProfile !== expected.modelProfile
      || cache.provider.name !== expected.provider
      || cache.provider.model !== expected.model
      || cache.analysisHash !== contentHash(analysis)
    ) return null;
    const validated = normalizeAndValidate(source, input, analysis);
    return (
      validated.blockingIssues.length === 0
      && contentHash(validated.analysis) === contentHash(analysis)
    ) ? validated.analysis : null;
  } catch {
    return null;
  }
};

type ValidatedChapter = ReturnType<typeof normalizeAndValidate>;

const analyzeAttempt = async (
  source: BookSource,
  input: ChapterDeepReadInput,
  provider: ChapterDeepReadProvider,
  priorAnalyses: readonly ChapterAnalysis[],
  qualityFeedback?: string[],
): Promise<{validated: ValidatedChapter | null; issues: string[]}> => {
  try {
    const validated = normalizeAndValidate(
      source,
      input,
      ChapterAnalysisSchema.parse(await provider.analyzeChapter(input, qualityFeedback)),
    );
    return {
      validated,
      issues: [
        ...validated.blockingIssues,
        ...repeatedClaimIssues([...priorAnalyses, validated.analysis]),
      ],
    };
  } catch (error) {
    if (error instanceof ChapterDeepReadOutputError) {
      return {
        validated: null,
        issues: error.issues.map((item) => `PROVIDER_OUTPUT_INVALID: ${item}`),
      };
    }
    throw error;
  }
};

export const createOrReuseTargetChapterAnalyses = async ({
  source: rawSource,
  map: rawMap,
  chaptersDirectory,
  provider,
  createdAt,
}: CreateOptions): Promise<ChapterDeepReadResult> => {
  const source = BookSourceSchema.parse(rawSource);
  const map = BookMapSchema.parse(rawMap);
  const targetIds = map.phase3BTargets.map((target) => target.chapterId);
  if (new Set(targetIds).size !== targetIds.length) {
    throw new Error("Phase 3B targets must be unique");
  }

  const analyses: ChapterAnalysis[] = [];
  const cacheHits: Record<string, boolean> = {};
  const needsReview: string[] = [];
  const blockingTraceabilityIssues: string[] = [];
  let unsupportedClaimsRemoved = 0;
  let causalOverclaimsCorrected = 0;
  const modelProfile = `${provider.provider}:${provider.model}`;
  for (const chapterId of targetIds) {
    const input = buildTargetInput(source, map, chapterId);
    const inputHash = contentHash(input);
    const outputPath = resolve(chaptersDirectory, `${chapterId}.json`);
    const cachePath = resolve(chaptersDirectory, ".cache", `${chapterId}.json`);
    const reviewPath = resolve(chaptersDirectory, `${chapterId}.needs-review.json`);
    const reusable = await readReusable(source, input, outputPath, cachePath, {
      inputHash,
      modelProfile,
      provider: provider.provider,
      model: provider.model,
    });
    if (reusable) {
      analyses.push(reusable);
      cacheHits[chapterId] = true;
      continue;
    }

    let attempt = await analyzeAttempt(source, input, provider, analyses);
    let validated = attempt.validated;
    let candidateIssues = attempt.issues;
    const initialCausalOverclaims = new Set(
      validated?.claimEvidenceIssues
        .filter((item) => item.code === "CAUSAL_OVERCLAIM")
        .map((item) => item.claimId) ?? [],
    ).size;
    let attemptUnsupportedClaimsRemoved = validated?.unsupportedClaimsRemoved ?? 0;
    let attemptCausalOverclaimsCorrected = validated?.causalOverclaimsCorrected ?? 0;
    if (candidateIssues.length > 0) {
      attempt = await analyzeAttempt(source, input, provider, analyses, candidateIssues);
      validated = attempt.validated;
      candidateIssues = attempt.issues;
      attemptUnsupportedClaimsRemoved += validated?.unsupportedClaimsRemoved ?? 0;
      attemptCausalOverclaimsCorrected += validated?.causalOverclaimsCorrected ?? 0;
      if (!validated || candidateIssues.length > 0) {
        const reviewCandidate = validated ? ChapterAnalysisSchema.parse({
          ...validated.analysis,
          quality: {
            ...validated.analysis.quality,
            status: "NEEDS_REVIEW",
            blockingIssues: candidateIssues,
          },
        }) : undefined;
        await writeValidatedJson(reviewPath, NeedsReviewSchema, {
          chapterId,
          status: "NEEDS_REVIEW",
          attempts: 2,
          provider: {name: provider.provider, model: provider.model},
          issues: candidateIssues,
          candidate: reviewCandidate,
          createdAt: createdAt ?? new Date().toISOString(),
        });
        await Promise.all([
          rm(outputPath, {force: true}),
          rm(cachePath, {force: true}),
        ]);
        needsReview.push(chapterId);
        blockingTraceabilityIssues.push(...candidateIssues);
        unsupportedClaimsRemoved += attemptUnsupportedClaimsRemoved;
        causalOverclaimsCorrected += attemptCausalOverclaimsCorrected;
        cacheHits[chapterId] = false;
        continue;
      }
      attemptCausalOverclaimsCorrected += initialCausalOverclaims;
    }
    if (!validated) throw new Error(`Chapter analysis missing after successful validation: ${chapterId}`);
    unsupportedClaimsRemoved += attemptUnsupportedClaimsRemoved;
    causalOverclaimsCorrected += attemptCausalOverclaimsCorrected;
    await rm(reviewPath, {force: true});
    await writeValidatedJson(outputPath, ChapterAnalysisSchema, validated.analysis);
    await writeValidatedJson(cachePath, CacheSchema, {
      artifact: {
        inputHash,
        promptVersion: CHAPTER_DEEP_READ_PROMPT_VERSION,
        modelProfile,
        schemaVersion: CHAPTER_DEEP_READ_SCHEMA_VERSION,
        createdAt: createdAt ?? new Date().toISOString(),
      },
      provider: {name: provider.provider, model: provider.model},
      analysisHash: contentHash(validated.analysis),
    });
    analyses.push(validated.analysis);
    cacheHits[chapterId] = false;
  }

  const setIssues = needsReview.length === 0 ? validateChapterAnalysisSet(analyses) : [];
  if (setIssues.length > 0) {
    throw new Error(`Chapter analysis set validation failed: ${setIssues.join("; ")}`);
  }
  return {
    analyses,
    cacheHits,
    blockingTraceabilityIssues,
    needsReview,
    unsupportedClaimsRemoved,
    causalOverclaimsCorrected,
  };
};
