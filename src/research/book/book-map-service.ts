import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {z} from "zod";
import {BookMapSchema, type BookMap} from "./book-map-schema";
import {
  buildBookMapEvidencePack,
  validateBookMapAgainstSource,
} from "./book-map-input";
import type {BookMapProvider} from "./book-map-provider";
import {
  MiniChapterMapSchema,
  WholeBookSynthesisSchema,
  normalizeMiniChapterMap,
  normalizeWholeBookSynthesis,
  validateWholeBookSynthesisQuality,
  type MiniChapterEvidence,
  type MiniChapterMap,
} from "./book-map-stages";
import {writeValidatedJson} from "./artifact-store";
import {ArtifactMetaSchema} from "./common-schema";
import type {BookSource} from "./source-schema";

export const BOOK_MAP_PROMPT_VERSION = "book-map-round-1-two-stage-v2";
export const MINI_CHAPTER_MAP_PROMPT_VERSION = "mini-chapter-map-v1";
export const BOOK_MAP_SCHEMA_VERSION = "1.0.0";

interface CreateBookMapOptions {
  source: BookSource;
  outputPath: string;
  provider: BookMapProvider;
  createdAt?: string;
}

export interface BookMapServiceResult {
  map: BookMap;
  cacheHit: boolean;
}

const MiniChapterMapCacheSchema = z.object({
  artifact: ArtifactMetaSchema,
  provider: z.object({name: z.string().min(1), model: z.string().min(1)}),
  map: MiniChapterMapSchema,
});

const contentHash = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");

const assertTraceability = (source: BookSource, map: BookMap): void => {
  const issues = validateBookMapAgainstSource(source, map);
  if (issues.length > 0) {
    throw new Error(`Book Map traceability validation failed: ${issues.join("; ")}`);
  }
};

const readReusableMap = async (
  outputPath: string,
  source: BookSource,
  expected: {inputHash: string; modelProfile: string; provider: string; model: string},
): Promise<BookMap | null> => {
  try {
    const map = BookMapSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    if (
      map.artifact.inputHash !== expected.inputHash
      || map.artifact.promptVersion !== BOOK_MAP_PROMPT_VERSION
      || map.artifact.schemaVersion !== BOOK_MAP_SCHEMA_VERSION
      || map.artifact.modelProfile !== expected.modelProfile
      || map.provider.name !== expected.provider
      || map.provider.model !== expected.model
    ) return null;
    assertTraceability(source, map);
    return map;
  } catch {
    return null;
  }
};

const validateMiniAgainstEvidence = (
  mini: MiniChapterMap,
  evidence: MiniChapterEvidence,
): boolean => {
  if (mini.chapterId !== evidence.chapterId || mini.title !== evidence.title) return false;
  const knownRefs = new Set(evidence.blocks.map((block) => (
    `${block.chapterId}:${block.page}:${block.blockId}`
  )));
  return mini.sourceRefs.every((reference) => (
    reference.chapterId === evidence.chapterId
    && knownRefs.has(`${reference.chapterId}:${reference.page}:${reference.blockId}`)
  ));
};

const readReusableMini = async (
  path: string,
  evidence: MiniChapterEvidence,
  expected: {inputHash: string; modelProfile: string; provider: string; model: string},
): Promise<MiniChapterMap | null> => {
  try {
    const cached = MiniChapterMapCacheSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (
      cached.artifact.inputHash !== expected.inputHash
      || cached.artifact.promptVersion !== MINI_CHAPTER_MAP_PROMPT_VERSION
      || cached.artifact.schemaVersion !== BOOK_MAP_SCHEMA_VERSION
      || cached.artifact.modelProfile !== expected.modelProfile
      || cached.provider.name !== expected.provider
      || cached.provider.model !== expected.model
      || !validateMiniAgainstEvidence(cached.map, evidence)
    ) return null;
    return cached.map;
  } catch {
    return null;
  }
};

const insufficientMini = (chapter: MiniChapterEvidence): MiniChapterMap => MiniChapterMapSchema.parse({
  analysisStatus: "insufficient_evidence",
  chapterId: chapter.chapterId,
  title: chapter.title,
  role: "低置信度内容排除后证据不足。",
  oneSentenceSummary: "本章没有足够的高置信度文本可用于全书鸟瞰判断。",
  keyConcepts: ["证据不足"],
  candidateTheses: ["证据不足，不能形成候选命题。"],
  importance: 0,
  deepReadPriority: "low",
  sourceRefs: [],
  analysisConfidence: 0,
});

export const createOrReuseBookMap = async ({
  source,
  outputPath,
  provider,
  createdAt,
}: CreateBookMapOptions): Promise<BookMapServiceResult> => {
  const evidencePack = buildBookMapEvidencePack(source);
  if (evidencePack.chapters.every((chapter) => chapter.blocks.length === 0)) {
    throw new Error("Book Map requires at least one eligible source block");
  }
  const inputHash = contentHash(evidencePack);
  const modelProfile = `${provider.provider}:${provider.model}`;
  const reusable = await readReusableMap(outputPath, source, {
    inputHash,
    modelProfile,
    provider: provider.provider,
    model: provider.model,
  });
  if (reusable) return {map: reusable, cacheHit: true};

  const chapterMapsDirectory = resolve(dirname(outputPath), "chapter-maps");
  const minis: MiniChapterMap[] = [];
  for (const chapter of evidencePack.chapters) {
    if (chapter.blocks.length === 0) {
      minis.push(insufficientMini(chapter));
      continue;
    }
    const chapterHash = contentHash(chapter);
    const cachePath = resolve(chapterMapsDirectory, `${chapter.chapterId}.json`);
    const cached = await readReusableMini(cachePath, chapter, {
      inputHash: chapterHash,
      modelProfile,
      provider: provider.provider,
      model: provider.model,
    });
    if (cached) {
      minis.push(normalizeMiniChapterMap(cached));
      continue;
    }

    const providerMini = await provider.analyzeChapter(chapter);
    const mini = normalizeMiniChapterMap(MiniChapterMapSchema.parse({
      ...providerMini,
      chapterId: chapter.chapterId,
      title: chapter.title,
    }));
    if (!validateMiniAgainstEvidence(mini, chapter)) {
      throw new Error(`MiniChapterMap traceability validation failed: ${chapter.chapterId}`);
    }
    await writeValidatedJson(cachePath, MiniChapterMapCacheSchema, {
      artifact: {
        inputHash: chapterHash,
        promptVersion: MINI_CHAPTER_MAP_PROMPT_VERSION,
        modelProfile,
        schemaVersion: BOOK_MAP_SCHEMA_VERSION,
        createdAt: createdAt ?? new Date().toISOString(),
      },
      provider: {name: provider.provider, model: provider.model},
      map: mini,
    });
    minis.push(mini);
  }

  const synthesisInput = {
    metadata: evidencePack.metadata,
    structure: evidencePack.structure,
    miniChapterMaps: minis,
    excludedLowConfidencePages: evidencePack.excludedLowConfidencePages,
  };
  let synthesis = normalizeWholeBookSynthesis(
    WholeBookSynthesisSchema.parse(await provider.synthesize(synthesisInput)),
  );
  let qualityIssues = validateWholeBookSynthesisQuality(minis, synthesis);
  if (qualityIssues.length > 0) {
    synthesis = normalizeWholeBookSynthesis(WholeBookSynthesisSchema.parse(
      await provider.synthesize(synthesisInput, qualityIssues),
    ));
    qualityIssues = validateWholeBookSynthesisQuality(minis, synthesis);
    if (qualityIssues.length > 0) {
      throw new Error(`Whole Book Synthesis quality validation failed: ${qualityIssues.join("; ")}`);
    }
  }

  const rankings = new Map(synthesis.chapterImportanceRanking.map((item) => [item.chapterId, item]));
  const chapters = evidencePack.chapters.map((chapter, index) => {
    const mini = minis[index]!;
    const ranking = rankings.get(chapter.chapterId)!;
    if (mini.analysisStatus === "insufficient_evidence") {
      return {
        chapterId: chapter.chapterId,
        title: chapter.title,
        startPage: chapter.startPage,
        endPage: chapter.endPage,
        role: mini.role,
        summary: mini.oneSentenceSummary,
        analysisStatus: "insufficient_evidence" as const,
        importance: 0 as const,
        deepReadPriority: "low" as const,
        sourceRefs: [],
      };
    }
    return {
      chapterId: chapter.chapterId,
      title: chapter.title,
      startPage: chapter.startPage,
      endPage: chapter.endPage,
      role: mini.role,
      summary: mini.oneSentenceSummary,
      analysisStatus: "analyzed" as const,
      importance: ranking.importance,
      deepReadPriority: ranking.deepReadPriority,
      sourceRefs: mini.sourceRefs,
    };
  });

  const map = BookMapSchema.parse({
    artifact: {
      inputHash,
      promptVersion: BOOK_MAP_PROMPT_VERSION,
      modelProfile,
      schemaVersion: BOOK_MAP_SCHEMA_VERSION,
      createdAt: createdAt ?? new Date().toISOString(),
    },
    provider: {name: provider.provider, model: provider.model},
    analysisLanguage: synthesis.analysisLanguage,
    coreProblem: synthesis.coreProblem,
    candidateCoreTheses: synthesis.candidateCoreTheses,
    structureOverview: synthesis.structureOverview,
    chapters,
    recurringConcepts: synthesis.recurringConcepts,
    phase3BTargets: synthesis.phase3BTargets,
    excludedLowConfidencePages: evidencePack.excludedLowConfidencePages,
    warnings: synthesis.warnings,
  });
  assertTraceability(source, map);
  await writeValidatedJson(outputPath, BookMapSchema, map);

  return {map, cacheHit: false};
};
