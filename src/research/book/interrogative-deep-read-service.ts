import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {z} from "zod";
import {readValidatedJson, writeValidatedJson} from "./artifact-store";
import {BookMapSchema, type BookMap} from "./book-map-schema";
import {ArtifactMetaSchema, type BookSourceRef} from "./common-schema";
import type {
  InterrogativeComparisonChapter,
  InterrogativeDeepReadInput,
  InterrogativeDeepReadProvider,
} from "./interrogative-deep-read-provider";
import {
  InterrogativeDeepReadDraftSchema,
  InterrogativeDeepReadSchema,
  type InterrogativeDeepRead,
} from "./interrogative-deep-read-schema";
import {ChapterAnalysisSchema, type ChapterAnalysis} from "./knowledge-schema";
import {BookSourceSchema, type BookSource} from "./source-schema";

export const INTERROGATIVE_DEEP_READ_PROMPT_VERSION = "interrogative-reread-v1";
export const INTERROGATIVE_DEEP_READ_SCHEMA_VERSION = "1.0.0";
const SELECTED_CHAPTER_COUNT = 3;
const MINIMUM_BLOCK_CONFIDENCE = 0.85;

const CacheSchema = z.object({
  artifact: ArtifactMetaSchema,
  provider: z.object({name: z.string().min(1), model: z.string().min(1)}),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/),
});

interface CreateOptions {
  source: BookSource;
  map: BookMap;
  analyses: ChapterAnalysis[];
  deepReadDirectory: string;
  provider: InterrogativeDeepReadProvider;
  createdAt?: string;
}

export interface InterrogativeDeepReadResult {
  outputs: InterrogativeDeepRead[];
  selectedChapters: string[];
  cacheHits: Record<string, boolean>;
  revisedClaimsCount: number;
  causalIssuesFound: number;
  scopeCorrectionsCount: number;
  contradictionsFound: number;
  blockingIssues: string[];
}

const hash = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");

const refKey = (ref: Pick<BookSourceRef, "chapterId" | "page" | "blockId">): string => (
  `${ref.chapterId}:${ref.page}:${ref.blockId}`
);

const bookRefs = (analysis: ChapterAnalysis): BookSourceRef[] => analysis.claims.flatMap((claim) => (
  claim.sourceRefs.filter((ref): ref is BookSourceRef => ref.type === "book")
));

const selectPassTargets = (
  map: BookMap,
  analyses: readonly ChapterAnalysis[],
): ChapterAnalysis[] => {
  const targets = new Set(map.phase3BTargets.map((target) => target.chapterId));
  const pass = analyses.filter((analysis) => (
    targets.has(analysis.chapterId)
    && analysis.quality.status === "PASS"
    && (analysis.quality.blockingIssues?.length ?? 0) === 0
  ));
  if (pass.length < SELECTED_CHAPTER_COUNT) {
    throw new Error(`Phase 3C requires at least ${SELECTED_CHAPTER_COUNT} PASS Phase 3B targets`);
  }
  return pass.sort((left, right) => (
    right.importance.score - left.importance.score
    || left.chapterId.localeCompare(right.chapterId)
  )).slice(0, SELECTED_CHAPTER_COUNT);
};

const comparisonFor = (analysis: ChapterAnalysis): InterrogativeComparisonChapter => ({
  chapterId: analysis.chapterId,
  title: analysis.title,
  importance: analysis.importance.score,
  summary: analysis.summary.oneSentence,
  claims: analysis.claims.map((claim) => ({
    claimId: claim.claimId,
    statement: claim.statement,
    sourceRefs: claim.sourceRefs.filter((ref): ref is BookSourceRef => ref.type === "book"),
  })),
});

const buildInput = (
  source: BookSource,
  analysis: ChapterAnalysis,
  allPassAnalyses: readonly ChapterAnalysis[],
): InterrogativeDeepReadInput => {
  const lowConfidencePages = new Set(
    source.extractionQuality.lowConfidencePages.map((item) => item.page),
  );
  const sourceBlocks = source.pages.flatMap((page) => (
    lowConfidencePages.has(page.page)
      ? []
      : page.contentBlocks.filter((block) => (
        block.chapterId === analysis.chapterId && block.confidence >= MINIMUM_BLOCK_CONFIDENCE
      )).map((block) => ({
        ref: {type: "book" as const, chapterId: block.chapterId, page: block.page, blockId: block.blockId},
        originalText: block.originalText,
        confidence: block.confidence,
      }))
  ));
  if (sourceBlocks.length === 0) {
    throw new Error(`Phase 3C chapter has no eligible source blocks: ${analysis.chapterId}`);
  }
  return {
    chapterId: analysis.chapterId,
    title: analysis.title,
    importance: analysis.importance.score,
    analysis,
    sourceBlocks,
    comparisonChapters: allPassAnalyses.map(comparisonFor),
  };
};

const refsFromDraft = (
  draft: z.infer<typeof InterrogativeDeepReadDraftSchema>,
): BookSourceRef[] => [
  ...draft.claimAssessments.flatMap((item) => item.sourceRefs),
  ...draft.revisedClaims.flatMap((item) => item.sourceRefs),
  ...draft.evidenceLimits.flatMap((item) => item.sourceRefs),
  ...draft.causalAssessment.flatMap((item) => item.sourceRefs),
  ...draft.hiddenAssumptions.flatMap((item) => item.sourceRefs),
  ...draft.counterpoints.flatMap((item) => item.sourceRefs),
  ...draft.contradictions.flatMap((item) => item.sourceRefs),
  ...draft.scopeCorrections.flatMap((item) => item.sourceRefs),
  ...draft.unresolvedQuestions.flatMap((item) => item.sourceRefs),
  ...draft.relationsToOtherChapters.flatMap((item) => item.sourceRefs),
  ...draft.sourceRefs,
];

const exactIdSet = (actual: readonly string[], expected: readonly string[]): boolean => (
  actual.length === expected.length
  && new Set(actual).size === actual.length
  && actual.every((id) => expected.includes(id))
);

const expandAndValidate = (
  source: BookSource,
  input: InterrogativeDeepReadInput,
  rawDraft: unknown,
): InterrogativeDeepRead => {
  const draft = InterrogativeDeepReadDraftSchema.parse(rawDraft);
  const claimIds = input.analysis.claims.map((claim) => claim.claimId);
  if (!exactIdSet(draft.claimAssessments.map((item) => item.claimId), claimIds)) {
    throw new Error(`CLAIM_ASSESSMENT_MISMATCH ${input.chapterId}`);
  }
  if (!exactIdSet(draft.evidenceLimits.map((item) => item.claimId), claimIds)) {
    throw new Error(`EVIDENCE_LIMIT_MISMATCH ${input.chapterId}`);
  }
  if (!exactIdSet(draft.causalAssessment.map((item) => item.claimId), claimIds)) {
    throw new Error(`CAUSAL_ASSESSMENT_MISMATCH ${input.chapterId}`);
  }
  const knownClaimIds = new Set(claimIds);
  for (const item of [...draft.revisedClaims, ...draft.scopeCorrections]) {
    const id = "originalClaimId" in item ? item.originalClaimId : item.claimId;
    if (!knownClaimIds.has(id)) throw new Error(`UNKNOWN_CLAIM ${input.chapterId}:${id}`);
  }
  const comparisonIds = new Set(input.comparisonChapters.map((item) => item.chapterId));
  for (const item of [...draft.contradictions, ...draft.relationsToOtherChapters]) {
    if (!comparisonIds.has(item.relatedChapterId) || item.relatedChapterId === input.chapterId) {
      throw new Error(`UNKNOWN_RELATED_CHAPTER ${input.chapterId}:${item.relatedChapterId}`);
    }
  }
  const lowConfidencePages = new Set(
    source.extractionQuality.lowConfidencePages.map((item) => item.page),
  );
  const knownSourceRefs = new Set(source.pages.flatMap((page) => (
    lowConfidencePages.has(page.page)
      ? []
      : page.contentBlocks.filter((block) => block.confidence >= MINIMUM_BLOCK_CONFIDENCE)
        .map((block) => refKey(block))
  )));
  const allowedSourceRefs = new Set([
    ...input.sourceBlocks.map((block) => refKey(block.ref)),
    ...input.comparisonChapters.flatMap((chapter) => (
      chapter.claims.flatMap((claim) => claim.sourceRefs.map(refKey))
    )),
  ]);
  for (const ref of refsFromDraft(draft)) {
    if (!knownSourceRefs.has(refKey(ref)) || !allowedSourceRefs.has(refKey(ref))) {
      throw new Error(`UNKNOWN_SOURCE_REF ${refKey(ref)}`);
    }
  }
  const assessmentByClaim = new Map(
    draft.claimAssessments.map((item) => [item.claimId, item]),
  );
  return InterrogativeDeepReadSchema.parse({
    chapterId: input.chapterId,
    originalClaims: input.analysis.claims.map((claim) => ({
      claimId: claim.claimId,
      statement: claim.statement,
      classification: assessmentByClaim.get(claim.claimId)!.classification,
      sourceRefs: bookRefs({
        ...input.analysis,
        claims: [claim],
      }),
    })),
    revisedClaims: draft.revisedClaims,
    evidenceLimits: draft.evidenceLimits,
    causalAssessment: draft.causalAssessment,
    hiddenAssumptions: draft.hiddenAssumptions,
    counterpoints: draft.counterpoints,
    contradictions: draft.contradictions,
    scopeCorrections: draft.scopeCorrections,
    unresolvedQuestions: draft.unresolvedQuestions,
    relationsToOtherChapters: draft.relationsToOtherChapters,
    finalJudgment: draft.finalJudgment,
    confidence: draft.confidence,
    sourceRefs: draft.sourceRefs,
  });
};

const readReusable = async (
  source: BookSource,
  input: InterrogativeDeepReadInput,
  outputPath: string,
  cachePath: string,
  expected: {inputHash: string; provider: string; model: string},
): Promise<InterrogativeDeepRead | null> => {
  try {
    const output = await readValidatedJson(outputPath, InterrogativeDeepReadSchema);
    const cache = await readValidatedJson(cachePath, CacheSchema);
    if (
      cache.artifact.inputHash !== expected.inputHash
      || cache.artifact.promptVersion !== INTERROGATIVE_DEEP_READ_PROMPT_VERSION
      || cache.artifact.schemaVersion !== INTERROGATIVE_DEEP_READ_SCHEMA_VERSION
      || cache.artifact.modelProfile !== `${expected.provider}:${expected.model}`
      || cache.provider.name !== expected.provider
      || cache.provider.model !== expected.model
      || cache.outputHash !== hash(output)
    ) return null;
    return output.chapterId === input.chapterId ? output : null;
  } catch {
    return null;
  }
};

export const createOrReuseInterrogativeDeepReads = async ({
  source: rawSource,
  map: rawMap,
  analyses: rawAnalyses,
  deepReadDirectory,
  provider,
  createdAt,
}: CreateOptions): Promise<InterrogativeDeepReadResult> => {
  const source = BookSourceSchema.parse(rawSource);
  const map = BookMapSchema.parse(rawMap);
  const analyses = rawAnalyses.map((analysis) => ChapterAnalysisSchema.parse(analysis));
  const targetIds = new Set(map.phase3BTargets.map((target) => target.chapterId));
  const allPassAnalyses = analyses.filter((analysis) => (
    targetIds.has(analysis.chapterId)
    && analysis.quality.status === "PASS"
    && (analysis.quality.blockingIssues?.length ?? 0) === 0
  ));
  const selected = selectPassTargets(map, analyses);
  const outputs: InterrogativeDeepRead[] = [];
  const cacheHits: Record<string, boolean> = {};
  for (const analysis of selected) {
    const input = buildInput(source, analysis, allPassAnalyses);
    const inputHash = hash(input);
    const outputPath = resolve(deepReadDirectory, `${analysis.chapterId}.json`);
    const cachePath = resolve(deepReadDirectory, ".cache", `${analysis.chapterId}.json`);
    const reusable = await readReusable(source, input, outputPath, cachePath, {
      inputHash,
      provider: provider.provider,
      model: provider.model,
    });
    if (reusable) {
      outputs.push(reusable);
      cacheHits[analysis.chapterId] = true;
      continue;
    }
    const output = expandAndValidate(source, input, await provider.analyzeChapter(input));
    await writeValidatedJson(outputPath, InterrogativeDeepReadSchema, output);
    await writeValidatedJson(cachePath, CacheSchema, {
      artifact: {
        inputHash,
        promptVersion: INTERROGATIVE_DEEP_READ_PROMPT_VERSION,
        modelProfile: `${provider.provider}:${provider.model}`,
        schemaVersion: INTERROGATIVE_DEEP_READ_SCHEMA_VERSION,
        createdAt: createdAt ?? new Date().toISOString(),
      },
      provider: {name: provider.provider, model: provider.model},
      outputHash: hash(output),
    });
    outputs.push(output);
    cacheHits[analysis.chapterId] = false;
  }
  return {
    outputs,
    selectedChapters: selected.map((analysis) => analysis.chapterId),
    cacheHits,
    revisedClaimsCount: outputs.reduce((sum, output) => sum + output.revisedClaims.length, 0),
    causalIssuesFound: outputs.reduce((sum, output) => sum + output.causalAssessment.filter((item) => (
      item.status === "association_only" || item.status === "overclaim"
    )).length, 0),
    scopeCorrectionsCount: outputs.reduce((sum, output) => sum + output.scopeCorrections.length, 0),
    contradictionsFound: outputs.reduce((sum, output) => sum + output.contradictions.length, 0),
    blockingIssues: [],
  };
};
