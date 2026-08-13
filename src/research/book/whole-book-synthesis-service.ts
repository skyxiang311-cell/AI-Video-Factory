import {createHash} from "node:crypto";
import {z} from "zod";
import {readValidatedJson, writeValidatedJson} from "./artifact-store";
import {BookMapSchema, type BookMap} from "./book-map-schema";
import {ArtifactMetaSchema, type BookSourceRef} from "./common-schema";
import {InterrogativeDeepReadSchema, type InterrogativeDeepRead} from "./interrogative-deep-read-schema";
import {ChapterAnalysisSchema, type ChapterAnalysis} from "./knowledge-schema";
import {
  WholeBookArgumentSynthesisSchema,
  type WholeBookArgumentSynthesis,
} from "./whole-book-argument-synthesis-schema";
import type {
  WholeBookSynthesisInput,
  WholeBookSynthesisProvider,
} from "./whole-book-synthesis-provider";

export const WHOLE_BOOK_SYNTHESIS_PROMPT_VERSION = "whole-book-argument-synthesis-v1";
export const WHOLE_BOOK_SYNTHESIS_SCHEMA_VERSION = "1.0.0";

const CacheSchema = z.object({
  artifact: ArtifactMetaSchema,
  provider: z.object({name: z.string().min(1), model: z.string().min(1)}),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/),
});

interface CreateOptions {
  map: BookMap;
  analyses: ChapterAnalysis[];
  deepReads: InterrogativeDeepRead[];
  outputPath: string;
  cachePath: string;
  provider: WholeBookSynthesisProvider;
  createdAt?: string;
}

export interface WholeBookSynthesisResult {
  synthesis: WholeBookArgumentSynthesis;
  cacheHit: boolean;
  blockingIssues: string[];
}

const hash = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");

const uniqueBookRefs = (refs: readonly BookSourceRef[]): BookSourceRef[] => [
  ...new Map(refs.map((ref) => [`${ref.chapterId}:${ref.page}:${ref.blockId}`, ref])).values(),
];

const buildInput = (
  map: BookMap,
  analyses: readonly ChapterAnalysis[],
  deepReads: readonly InterrogativeDeepRead[],
): WholeBookSynthesisInput => {
  const passAnalyses = analyses.filter((analysis) => (
    analysis.quality.status === "PASS"
    && (analysis.quality.blockingIssues?.length ?? 0) === 0
    && analysis.claims.length > 0
  ));
  if (passAnalyses.length === 0) throw new Error("Whole-book synthesis requires PASS Phase 3B Claims");
  const chapterMap = new Map(map.chapters.map((chapter) => [chapter.chapterId, chapter]));
  const claimIds = new Set<string>();
  const claims = passAnalyses.flatMap((analysis) => analysis.claims.map((claim) => {
    if (claimIds.has(claim.claimId)) throw new Error(`DUPLICATE_SYNTHESIS_CLAIM ${claim.claimId}`);
    claimIds.add(claim.claimId);
    const directEvidence = analysis.evidence.filter((evidence) => (
      evidence.supportsClaimIds.includes(claim.claimId)
    ));
    const bookRefs = claim.sourceRefs.filter((ref): ref is BookSourceRef => ref.type === "book");
    return {
      claimId: claim.claimId,
      chapterId: analysis.chapterId,
      statement: claim.statement,
      authorPosition: claim.authorPosition,
      scope: claim.scope,
      importance: claim.importance.score,
      evidenceSummaries: directEvidence.map((evidence) => evidence.summary),
      limitations: analysis.limitations,
      sourceRefs: uniqueBookRefs([...claim.bookEvidenceRefs, ...bookRefs]),
    };
  }));
  const validDeepReads = deepReads.filter((deepRead) => (
    passAnalyses.some((analysis) => analysis.chapterId === deepRead.chapterId)
    && deepRead.originalClaims.every((claim) => claimIds.has(claim.claimId))
  ));
  return {
    map: {
      coreProblem: map.coreProblem.summary,
      candidateCoreTheses: map.candidateCoreTheses.map((item) => item.statement),
      structureOverview: map.structureOverview.summary,
      recurringConcepts: map.recurringConcepts.map((item) => item.concept),
    },
    chapters: passAnalyses.map((analysis) => {
      const mapped = chapterMap.get(analysis.chapterId);
      return {
        chapterId: analysis.chapterId,
        title: analysis.title,
        importance: analysis.importance.score,
        summary: analysis.summary.oneSentence,
        role: mapped?.role ?? analysis.chapterRole,
      };
    }).sort((left, right) => right.importance - left.importance || left.chapterId.localeCompare(right.chapterId)),
    claims,
    deepReads: validDeepReads,
  };
};

const referencedClaimIds = (synthesis: WholeBookArgumentSynthesis): string[] => [
  ...synthesis.coreThesis.flatMap((item) => item.supportingClaimIds),
  ...synthesis.secondaryTheses.flatMap((item) => item.supportingClaimIds),
  ...synthesis.argumentMap.flatMap((item) => item.supportingClaimIds),
  ...synthesis.keyConcepts.flatMap((item) => item.supportingClaimIds),
  ...synthesis.crossChapterPatterns.flatMap((item) => item.supportingClaimIds),
  ...synthesis.tensions.flatMap((item) => item.supportingClaimIds),
  ...synthesis.limitations.flatMap((item) => item.supportingClaimIds),
  ...synthesis.practicalFrameworks.flatMap((item) => item.supportingClaimIds),
  ...synthesis.readerTakeaways.flatMap((item) => item.supportingClaimIds),
  ...synthesis.relations.flatMap((item) => [item.fromClaimId, item.toClaimId]),
];

const normalize = (value: string): string => value
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]/gu, "");

const semanticFeatures = (value: string): Set<string> => {
  const normalized = normalize(value);
  const features = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    features.add(normalized.slice(index, index + 2));
  }
  return features;
};

const semanticCoverage = (statement: string, support: string): number => {
  const statementFeatures = semanticFeatures(statement);
  if (statementFeatures.size === 0) return 0;
  const supportFeatures = semanticFeatures(support);
  let overlap = 0;
  for (const feature of statementFeatures) {
    if (supportFeatures.has(feature)) overlap += 1;
  }
  return overlap / statementFeatures.size;
};

const numericTokens = (value: string): string[] => (
  value.normalize("NFKC").match(/\d+(?:\.\d+)?%?/gu) ?? []
);

const causalLanguage = /(导致|造成|决定|必然|因此产生|使得|引发|促使|推动|带来|致使|源于|归因于|因为|由于|所以|因而|从而)/u;

const supportedCoreTheses = (
  synthesis: WholeBookArgumentSynthesis,
  input: WholeBookSynthesisInput,
): WholeBookArgumentSynthesis["coreThesis"] => {
  const claims = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  return synthesis.coreThesis.filter((thesis) => {
    const support = thesis.supportingClaimIds
      .map((claimId) => claims.get(claimId)?.statement ?? "")
      .join("\n");
    const supportNumbers = new Set(numericTokens(support));
    return semanticCoverage(thesis.statement, support) >= 0.28
      && numericTokens(thesis.statement).every((number) => supportNumbers.has(number))
      && (!causalLanguage.test(thesis.statement) || causalLanguage.test(support));
  });
};

const validateOutput = (
  raw: unknown,
  input: WholeBookSynthesisInput,
): WholeBookArgumentSynthesis => {
  const parsed = WholeBookArgumentSynthesisSchema.parse(raw);
  const coreThesis = supportedCoreTheses(parsed, input).map((thesis) => ({
    ...thesis,
    perspective: "system_synthesis" as const,
  }));
  if (coreThesis.length === 0) {
    throw new Error("UNSUPPORTED_CORE_THESIS No core thesis is directly supported by its Claims");
  }
  const synthesis = WholeBookArgumentSynthesisSchema.parse({
    ...parsed,
    coreThesis,
    secondaryTheses: parsed.secondaryTheses.map((thesis) => ({
      ...thesis,
      perspective: "system_synthesis" as const,
    })),
  });
  const knownClaims = new Set(input.claims.map((claim) => claim.claimId));
  const missing = [...new Set(referencedClaimIds(synthesis).filter((claimId) => !knownClaims.has(claimId)))];
  if (missing.length > 0) {
    throw new Error(`MISSING_SYNTHESIS_CLAIM ${missing.join(",")}`);
  }
  const knownChapters = new Set(input.chapters.map((chapter) => chapter.chapterId));
  const missingChapters = [...new Set(synthesis.crossChapterPatterns.flatMap((pattern) => (
    pattern.chapterIds.filter((chapterId) => !knownChapters.has(chapterId))
  )))];
  if (missingChapters.length > 0) {
    throw new Error(`MISSING_SYNTHESIS_CHAPTER ${missingChapters.join(",")}`);
  }
  const relationTypes = new Set(synthesis.relations.map((relation) => relation.relation));
  if (relationTypes.size < 3) {
    throw new Error("INSUFFICIENT_RELATION_TYPES Whole-book synthesis requires at least 3 relation types");
  }
  if (!synthesis.argumentMap.some((item) => item.perspective === "author_view")) {
    throw new Error("AUTHOR_VIEW_MISSING");
  }
  if (input.deepReads.length > 0) {
    if (!synthesis.tensions.some((item) => item.perspective === "phase3c_critique")) {
      throw new Error("PHASE3C_TENSION_MISSING");
    }
    if (!synthesis.limitations.some((item) => item.perspective === "phase3c_critique")) {
      throw new Error("PHASE3C_LIMITATION_MISSING");
    }
  }
  return synthesis;
};

const readReusable = async (
  input: WholeBookSynthesisInput,
  outputPath: string,
  cachePath: string,
  provider: WholeBookSynthesisProvider,
): Promise<WholeBookArgumentSynthesis | null> => {
  try {
    const output = await readValidatedJson(outputPath, WholeBookArgumentSynthesisSchema);
    const cache = await readValidatedJson(cachePath, CacheSchema);
    if (
      cache.artifact.inputHash !== hash(input)
      || cache.artifact.promptVersion !== WHOLE_BOOK_SYNTHESIS_PROMPT_VERSION
      || cache.artifact.schemaVersion !== WHOLE_BOOK_SYNTHESIS_SCHEMA_VERSION
      || cache.artifact.modelProfile !== `${provider.provider}:${provider.model}`
      || cache.provider.name !== provider.provider
      || cache.provider.model !== provider.model
      || cache.outputHash !== hash(output)
    ) return null;
    const validated = validateOutput(output, input);
    if (hash(validated) !== hash(output)) {
      await writeValidatedJson(outputPath, WholeBookArgumentSynthesisSchema, validated);
      await writeValidatedJson(cachePath, CacheSchema, {
        ...cache,
        outputHash: hash(validated),
      });
    }
    return validated;
  } catch {
    return null;
  }
};

export const createOrReuseWholeBookSynthesis = async ({
  map: rawMap,
  analyses: rawAnalyses,
  deepReads: rawDeepReads,
  outputPath,
  cachePath,
  provider,
  createdAt,
}: CreateOptions): Promise<WholeBookSynthesisResult> => {
  const map = BookMapSchema.parse(rawMap);
  const analyses = rawAnalyses.map((analysis) => ChapterAnalysisSchema.parse(analysis));
  const deepReads = rawDeepReads.map((deepRead) => InterrogativeDeepReadSchema.parse(deepRead));
  const input = buildInput(map, analyses, deepReads);
  const reusable = await readReusable(input, outputPath, cachePath, provider);
  if (reusable) return {synthesis: reusable, cacheHit: true, blockingIssues: []};
  const synthesis = validateOutput(await provider.synthesize(input), input);
  await writeValidatedJson(outputPath, WholeBookArgumentSynthesisSchema, synthesis);
  await writeValidatedJson(cachePath, CacheSchema, {
    artifact: {
      inputHash: hash(input),
      promptVersion: WHOLE_BOOK_SYNTHESIS_PROMPT_VERSION,
      modelProfile: `${provider.provider}:${provider.model}`,
      schemaVersion: WHOLE_BOOK_SYNTHESIS_SCHEMA_VERSION,
      createdAt: createdAt ?? new Date().toISOString(),
    },
    provider: {name: provider.provider, model: provider.model},
    outputHash: hash(synthesis),
  });
  return {synthesis, cacheHit: false, blockingIssues: []};
};
