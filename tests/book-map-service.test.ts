import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {BookMapSchema, type BookMapDraft} from "../src/research/book/book-map-schema";
import type {BookMapEvidencePack} from "../src/research/book/book-map-input";
import type {BookMapProvider} from "../src/research/book/book-map-provider";
import {
  MiniChapterMapSchema,
  WholeBookSynthesisSchema,
  type MiniChapterEvidence,
  type MiniChapterMap,
  type WholeBookSynthesis,
  type WholeBookSynthesisInput,
} from "../src/research/book/book-map-stages";
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

const splitDraft = (draft: BookMapDraft): {
  minis: MiniChapterMap[];
  synthesis: WholeBookSynthesis;
} => ({
  minis: draft.chapters.map((chapter) => MiniChapterMapSchema.parse({
    chapterId: chapter.chapterId,
    title: chapter.title,
    role: chapter.role,
    oneSentenceSummary: chapter.summary,
    keyConcepts: [chapter.title],
    candidateTheses: [`候选命题：${chapter.summary}`],
    importance: chapter.importance,
    deepReadPriority: chapter.deepReadPriority,
    sourceRefs: chapter.sourceRefs,
    analysisConfidence: chapter.analysisStatus === "analyzed" ? 0.9 : 0,
  })),
  synthesis: WholeBookSynthesisSchema.parse({
    analysisLanguage: draft.analysisLanguage,
    coreProblem: draft.coreProblem,
    candidateCoreTheses: draft.candidateCoreTheses,
    structureOverview: draft.structureOverview,
    recurringConcepts: draft.recurringConcepts,
    chapterImportanceRanking: draft.chapters.map((chapter) => ({
      chapterId: chapter.chapterId,
      importance: chapter.importance,
      deepReadPriority: chapter.deepReadPriority,
      reason: `比较全书后确定 ${chapter.title} 的排序。`,
    })),
    phase3BTargets: draft.phase3BTargets,
    warnings: draft.warnings,
  }),
});

class SyntheticBookMapProvider implements BookMapProvider {
  readonly provider = "synthetic-provider";
  readonly model = "synthetic-book-map-v1";
  chapterCalls: MiniChapterEvidence[] = [];
  synthesisCalls: WholeBookSynthesisInput[] = [];
  private readonly minis: MiniChapterMap[];
  private readonly synthesis: WholeBookSynthesis;

  constructor(draft: BookMapDraft) {
    const stages = splitDraft(draft);
    this.minis = stages.minis;
    this.synthesis = stages.synthesis;
  }

  async analyzeChapter(input: MiniChapterEvidence): Promise<MiniChapterMap> {
    this.chapterCalls.push(input);
    return structuredClone(this.minis.find((mini) => mini.chapterId === input.chapterId)!);
  }

  async synthesize(
    input: WholeBookSynthesisInput,
    _qualityFeedback?: string[],
  ): Promise<WholeBookSynthesis> {
    this.synthesisCalls.push(input);
    return structuredClone(this.synthesis);
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
    expect(provider.chapterCalls).toHaveLength(2);
    expect(provider.synthesisCalls).toHaveLength(1);
    await expect(readFile(join(directory, "chapter-maps/chapter-micro-retrospective.json"), "utf8"))
      .resolves.toContain("chapter-micro-retrospective");
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
    expect(provider.chapterCalls.map((call) => call.chapterId)).toEqual([
      "chapter-micro-retrospective",
      "chapter-feedback-window",
      "chapter-micro-retrospective",
    ]);
    expect(provider.synthesisCalls).toHaveLength(2);
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
    expect(provider.chapterCalls).toHaveLength(2);
    expect(provider.synthesisCalls).toHaveLength(2);
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
    expect(provider.chapterCalls).toHaveLength(2);
    expect(provider.synthesisCalls).toHaveLength(2);
    expect(result.map.excludedLowConfidencePages).toEqual([]);
  });

  it("preserves authoritative source chapter identity when the model rewrites it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-map-service-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "book-map.json");
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    const provider = new SyntheticBookMapProvider(await loadDraft());
    const analyze = provider.analyzeChapter.bind(provider);
    provider.analyzeChapter = async (input) => ({
      ...await analyze(input),
      chapterId: "chapter-model-rewrite",
      title: "模型改写的标题",
    });

    const result = await createOrReuseBookMap({source, outputPath, provider});

    expect(result.map.chapters.map(({chapterId, title}) => ({chapterId, title})))
      .toEqual(source.structure.chapters.map(({chapterId, title}) => ({chapterId, title})));
  });

  it("retries only whole-book synthesis once with quality-gate feedback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-map-service-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "book-map.json");
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    const provider = new SyntheticBookMapProvider(await loadDraft());
    const synthesize = provider.synthesize.bind(provider);
    const feedback: Array<string[] | undefined> = [];
    provider.synthesize = async (input, qualityFeedback) => {
      feedback.push(qualityFeedback);
      const result = await synthesize(input);
      if (!qualityFeedback) result.phase3BTargets = [];
      return result;
    };

    const result = await createOrReuseBookMap({source, outputPath, provider});

    expect(result.map.phase3BTargets).toHaveLength(1);
    expect(provider.chapterCalls).toHaveLength(2);
    expect(provider.synthesisCalls).toHaveLength(2);
    expect(feedback[0]).toBeUndefined();
    expect(feedback[1]?.join(" ")).toContain("3-8 Phase 3B targets");
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
