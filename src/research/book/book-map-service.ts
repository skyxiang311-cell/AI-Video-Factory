import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {BookMapSchema, type BookMap} from "./book-map-schema";
import {
  buildBookMapEvidencePack,
  validateBookMapAgainstSource,
} from "./book-map-input";
import type {BookMapProvider} from "./book-map-provider";
import {writeValidatedJson} from "./artifact-store";
import type {BookSource} from "./source-schema";

export const BOOK_MAP_PROMPT_VERSION = "book-map-round-1-v1";
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

const sourceContentHash = (source: BookSource): string => createHash("sha256")
  .update(JSON.stringify(source))
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
  expected: {
    inputHash: string;
    modelProfile: string;
    provider: string;
    model: string;
  },
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
    ) {
      return null;
    }
    assertTraceability(source, map);
    return map;
  } catch {
    return null;
  }
};

export const createOrReuseBookMap = async ({
  source,
  outputPath,
  provider,
  createdAt,
}: CreateBookMapOptions): Promise<BookMapServiceResult> => {
  const inputHash = sourceContentHash(source);
  const modelProfile = `${provider.provider}:${provider.model}`;
  const reusable = await readReusableMap(outputPath, source, {
    inputHash,
    modelProfile,
    provider: provider.provider,
    model: provider.model,
  });
  if (reusable) return {map: reusable, cacheHit: true};

  const evidencePack = buildBookMapEvidencePack(source);
  if (evidencePack.chapters.every((chapter) => chapter.blocks.length === 0)) {
    throw new Error("Book Map requires at least one eligible source block");
  }
  const providerDraft = await provider.analyze(evidencePack);
  const map = BookMapSchema.parse({
    artifact: {
      inputHash,
      promptVersion: BOOK_MAP_PROMPT_VERSION,
      modelProfile,
      schemaVersion: BOOK_MAP_SCHEMA_VERSION,
      createdAt: createdAt ?? new Date().toISOString(),
    },
    provider: {
      name: provider.provider,
      model: provider.model,
    },
    ...providerDraft,
    excludedLowConfidencePages: evidencePack.excludedLowConfidencePages,
  });
  assertTraceability(source, map);
  await writeValidatedJson(outputPath, BookMapSchema, map);

  return {map, cacheHit: false};
};
