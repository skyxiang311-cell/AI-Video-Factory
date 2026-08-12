import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {BookMapSchema, type BookMapDraft} from "../src/research/book/book-map-schema";
import type {BookMapEvidencePack} from "../src/research/book/book-map-input";
import type {BookMapProvider} from "../src/research/book/book-map-provider";
import {createOrReuseBookMap} from "../src/research/book/book-map-service";
import {BookSourceSchema} from "../src/research/book/source-schema";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, {force: true, recursive: true})
  )));
});

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const loadDraft = async (): Promise<BookMapDraft> => {
  const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
  const {artifact: _artifact, provider: _provider, ...draft} = map;
  return draft;
};

class SyntheticBookMapProvider implements BookMapProvider {
  readonly provider = "synthetic-provider";
  readonly model = "synthetic-book-map-v1";
  calls: BookMapEvidencePack[] = [];
  constructor(private readonly draft: BookMapDraft) {}

  async analyze(input: BookMapEvidencePack): Promise<BookMapDraft> {
    this.calls.push(input);
    return structuredClone(this.draft);
  }
}

describe("Book Map service cache", () => {
  it("persists once and reuses a validated unchanged Book Map", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-map-service-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "book-map.json");
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    const provider = new SyntheticBookMapProvider(await loadDraft());

    const first = await createOrReuseBookMap({
      source,
      outputPath,
      provider,
      createdAt: "2026-08-12T00:00:00.000Z",
    });
    const second = await createOrReuseBookMap({
      source,
      outputPath,
      provider,
      createdAt: "2026-08-12T01:00:00.000Z",
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.map).toEqual(first.map);
    expect(provider.calls).toHaveLength(1);
    expect(BookMapSchema.parse(JSON.parse(await readFile(outputPath, "utf8"))))
      .toEqual(first.map);
    expect(first.map.provider).toEqual({
      name: "synthetic-provider",
      model: "synthetic-book-map-v1",
    });
  });

  it("invalidates the cache when eligible source content changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-map-service-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "book-map.json");
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    const provider = new SyntheticBookMapProvider(await loadDraft());

    const first = await createOrReuseBookMap({source, outputPath, provider});
    source.pages[0]!.contentBlocks[0]!.originalText += " 合成变更。";
    const second = await createOrReuseBookMap({source, outputPath, provider});

    expect(second.cacheHit).toBe(false);
    expect(second.map.artifact.inputHash).not.toBe(first.map.artifact.inputHash);
    expect(provider.calls).toHaveLength(2);
  });

  it("does not reuse a cache whose source references were corrupted", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-map-service-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "book-map.json");
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    const provider = new SyntheticBookMapProvider(await loadDraft());

    await createOrReuseBookMap({source, outputPath, provider});
    const corrupted = JSON.parse(await readFile(outputPath, "utf8")) as {
      coreProblem: {sourceRefs: Array<{blockId: string}>};
    };
    corrupted.coreProblem.sourceRefs[0]!.blockId = "p1-bmissing";
    await writeFile(outputPath, JSON.stringify(corrupted), "utf8");

    const result = await createOrReuseBookMap({source, outputPath, provider});

    expect(result.cacheHit).toBe(false);
    expect(provider.calls).toHaveLength(2);
    expect(result.map.coreProblem.sourceRefs[0]?.blockId)
      .toBe("p1-bmicro-retrospective");
  });

  it("does not reuse a cache whose deterministic exclusion record was corrupted", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-map-service-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "book-map.json");
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    const provider = new SyntheticBookMapProvider(await loadDraft());

    await createOrReuseBookMap({source, outputPath, provider});
    const corrupted = JSON.parse(await readFile(outputPath, "utf8")) as {
      excludedLowConfidencePages: Array<{page: number; reason: string}>;
    };
    corrupted.excludedLowConfidencePages = [{page: 2, reason: "伪造排除记录"}];
    await writeFile(outputPath, JSON.stringify(corrupted), "utf8");

    const result = await createOrReuseBookMap({source, outputPath, provider});

    expect(result.cacheHit).toBe(false);
    expect(provider.calls).toHaveLength(2);
    expect(result.map.excludedLowConfidencePages).toEqual([]);
  });

  it("rejects provider output that cites excluded low-confidence OCR content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-map-service-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "book-map.json");
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    source.extractionQuality.lowConfidencePages = [{page: 2, confidence: 0.4}];
    const provider = new SyntheticBookMapProvider(await loadDraft());

    await expect(createOrReuseBookMap({source, outputPath, provider})).rejects.toThrow(
      "Book Map traceability validation failed",
    );
    await expect(readFile(outputPath, "utf8")).rejects.toMatchObject({code: "ENOENT"});
  });
});
