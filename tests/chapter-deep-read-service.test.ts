import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {BookMapSchema, type BookMap} from "../src/research/book/book-map-schema";
import type {
  ChapterDeepReadInput,
  ChapterDeepReadProvider,
} from "../src/research/book/chapter-deep-read-provider";
import {
  createOrReuseTargetChapterAnalyses,
  validateChapterAnalysisSet,
} from "../src/research/book/chapter-deep-read-service";
import {ChapterAnalysisSchema, type ChapterAnalysis} from "../src/research/book/knowledge-schema";
import {ChapterDeepReadOutputError} from "../src/research/book/chapter-deep-read-provider";
import {BookSourceSchema, type BookSource} from "../src/research/book/source-schema";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, {force: true, recursive: true})
  )));
});

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const loadInputs = async (): Promise<{source: BookSource; map: BookMap}> => {
  const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
  const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
  const second = map.chapters[1]!;
  map.phase3BTargets.push({
    chapterId: second.chapterId,
    priority: second.importance,
    reason: "需要进一步深读该章的证据边界。",
    sourceRefs: second.sourceRefs,
  });
  return {source, map};
};

const analysisFor = (input: ChapterDeepReadInput): ChapterAnalysis => {
  const first = input.blocks[0]!;
  const reference = {
    type: "book" as const,
    chapterId: input.chapterId,
    page: first.page,
    blockId: first.blockId,
  };
  const suffix = input.chapterId.replace("chapter-", "");
  const claimId = `claim-${suffix}-core`;
  return ChapterAnalysisSchema.parse({
    chapterId: input.chapterId,
    title: input.title,
    importance: {
      score: input.importance,
      level: "core",
      reason: input.targetReason,
    },
    chapterRole: "core_argument",
    summary: {
      oneSentence: `${input.title}提出本章独有机制。`,
      detailed: `作者围绕${input.title}界定条件、论证机制并保留适用边界。`,
    },
    claims: [{
      claimId,
      type: "mechanism",
      statement: `作者在本章写道：${first.originalText}`,
      importance: {score: 88, level: "core", reason: "构成本章核心论证。"},
      authorPosition: "这是作者在本章明确提出的观点，不是分析模型自己的事实判断。",
      scope: {
        appliesTo: [`${input.title}明确讨论的对象`],
        doesNotNecessarilyApplyTo: ["本章没有讨论的其他情境"],
      },
      bookEvidenceRefs: [reference],
      sourceRefs: [reference],
      confidence: 0.92,
      verificationStatus: "not_required",
      evidenceSupport: "strong",
    }],
    arguments: ["作者先界定问题，再说明机制。"],
    evidence: [{
      evidenceId: `evidence-${suffix}-argument`,
      type: "logical_argument",
      summary: first.originalText,
      supportsClaimIds: [claimId],
      strength: 0.72,
      sourceRef: reference,
      originalExcerpt: first.originalText,
      interpretation: "这是书内逻辑论证，不等于外部事实验证。",
      confidence: first.confidence,
    }, {
      evidenceId: `evidence-${suffix}-observation`,
      type: "author_observation",
      summary: first.originalText,
      supportsClaimIds: [claimId],
      strength: 0.55,
      sourceRef: reference,
      originalExcerpt: first.originalText,
      interpretation: "这是作者观察，证明力低于独立研究。",
      confidence: first.confidence,
    }],
    concepts: [`${input.title}的核心概念`],
    examples: ["本章原文中的说明性情境。"],
    limitations: ["不能推广到本章没有讨论的对象。"],
    questions: ["该机制的边界是否需要后续核验？"],
    relationsToOtherChapters: [],
    quality: {confidence: 0.9},
  });
};

class SyntheticProvider implements ChapterDeepReadProvider {
  readonly provider = "synthetic";
  readonly model = "synthetic-v1";
  calls: ChapterDeepReadInput[] = [];
  async analyzeChapter(
    input: ChapterDeepReadInput,
    _qualityFeedback?: string[],
  ): Promise<ChapterAnalysis> {
    this.calls.push(structuredClone(input));
    return analysisFor(input);
  }
}

describe("claim-first target chapter service", () => {
  it("dynamically processes every phase3B target and persists one Schema-valid JSON each", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    source.pages[0]!.contentBlocks.push({
      ...source.pages[0]!.contentBlocks[0]!,
      blockId: "p1-blow-confidence",
      originalText: "低置信度内容不得进入模型输入。",
      confidence: 0.4,
    });
    const provider = new SyntheticProvider();

    const result = await createOrReuseTargetChapterAnalyses({
      source,
      map,
      chaptersDirectory: directory,
      provider,
      createdAt: "2026-08-13T00:00:00.000Z",
    });

    expect(provider.calls.map((call) => call.chapterId)).toEqual(
      map.phase3BTargets.map((target) => target.chapterId),
    );
    expect(provider.calls[0]!.blocks.map((block) => block.blockId))
      .not.toContain("p1-blow-confidence");
    expect(result.analyses).toHaveLength(2);
    expect(result.blockingTraceabilityIssues).toEqual([]);
    for (const target of map.phase3BTargets) {
      const output = ChapterAnalysisSchema.parse(JSON.parse(
        await readFile(join(directory, `${target.chapterId}.json`), "utf8"),
      ));
      expect(output.chapterId).toBe(target.chapterId);
      expect(new Set(output.evidence.map((evidence) => evidence.type)).size).toBeGreaterThanOrEqual(2);
      expect(output.claims.every((claim) => claim.sourceRefs.length > 0)).toBe(true);
    }
  });

  it("reuses unchanged chapter caches and calls the provider only for changed chapter evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    const provider = new SyntheticProvider();

    await createOrReuseTargetChapterAnalyses({source, map, chaptersDirectory: directory, provider});
    await createOrReuseTargetChapterAnalyses({source, map, chaptersDirectory: directory, provider});
    source.pages[0]!.contentBlocks[0]!.originalText += " 合成变更。";
    const third = await createOrReuseTargetChapterAnalyses({
      source,
      map,
      chaptersDirectory: directory,
      provider,
    });

    expect(provider.calls.map((call) => call.chapterId)).toEqual([
      "chapter-micro-retrospective",
      "chapter-feedback-window",
      "chapter-micro-retrospective",
    ]);
    expect(third.cacheHits).toEqual({
      "chapter-micro-retrospective": false,
      "chapter-feedback-window": true,
    });
  });

  it("invalidates only when any provider input for the chapter changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    map.phase3BTargets = [map.phase3BTargets[0]!];
    const provider = new SyntheticProvider();

    await createOrReuseTargetChapterAnalyses({source, map, chaptersDirectory: directory, provider});
    map.chapters[0]!.summary += " 更新后的章节定位。";
    const result = await createOrReuseTargetChapterAnalyses({
      source,
      map,
      chaptersDirectory: directory,
      provider,
    });

    expect(provider.calls).toHaveLength(2);
    expect(result.cacheHits).toEqual({"chapter-micro-retrospective": false});
  });

  it("invalidates a v1 chapter cache after the evidence-quality prompt upgrade", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    map.phase3BTargets = [map.phase3BTargets[0]!];
    const provider = new SyntheticProvider();

    await createOrReuseTargetChapterAnalyses({source, map, chaptersDirectory: directory, provider});
    const cachePath = join(directory, ".cache", "chapter-micro-retrospective.json");
    const cache = JSON.parse(await readFile(cachePath, "utf8")) as {
      artifact: {promptVersion: string};
    };
    cache.artifact.promptVersion = "claim-first-chapter-v1";
    await writeFile(cachePath, JSON.stringify(cache), "utf8");
    await createOrReuseTargetChapterAnalyses({source, map, chaptersDirectory: directory, provider});

    expect(provider.calls).toHaveLength(2);
  });

  it("invalidates a cache whose persisted artifact only passes after automatic calibration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    map.phase3BTargets = [map.phase3BTargets[0]!];
    const provider = new SyntheticProvider();

    await createOrReuseTargetChapterAnalyses({source, map, chaptersDirectory: directory, provider});
    const chapterId = "chapter-micro-retrospective";
    const outputPath = join(directory, `${chapterId}.json`);
    const cachePath = join(directory, ".cache", `${chapterId}.json`);
    const output = JSON.parse(await readFile(outputPath, "utf8")) as ChapterAnalysis;
    output.evidence[0]!.summary = "不匹配原文、但可被自动移除的证据摘要。";
    const cache = JSON.parse(await readFile(cachePath, "utf8")) as {analysisHash: string};
    cache.analysisHash = createHash("sha256").update(JSON.stringify(output)).digest("hex");
    await writeFile(outputPath, JSON.stringify(output), "utf8");
    await writeFile(cachePath, JSON.stringify(cache), "utf8");

    await createOrReuseTargetChapterAnalyses({source, map, chaptersDirectory: directory, provider});

    expect(provider.calls).toHaveLength(2);
  });

  it("rejects dangling Claim and Evidence references before writing output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    map.phase3BTargets = [map.phase3BTargets[0]!];
    const provider = new SyntheticProvider();
    provider.analyzeChapter = async (input) => {
      const analysis = analysisFor(input);
      analysis.claims[0]!.sourceRefs[0] = {
        type: "book",
        chapterId: input.chapterId,
        page: 999,
        blockId: "p999-bmissing",
      };
      return analysis;
    };

    const result = await createOrReuseTargetChapterAnalyses({
      source,
      map,
      chaptersDirectory: directory,
      provider,
    });
    expect(result.needsReview).toEqual(["chapter-micro-retrospective"]);
    expect(result.blockingTraceabilityIssues.join(" ")).toContain("MISSING_BOOK_BLOCK");
    await expect(readFile(join(directory, "chapter-micro-retrospective.json"), "utf8"))
      .rejects.toMatchObject({code: "ENOENT"});
  });

  it("feeds concrete Claim-Evidence issues back once and persists the corrected chapter", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    map.phase3BTargets = [map.phase3BTargets[0]!];
    const provider = new SyntheticProvider();
    const feedback: Array<string[] | undefined> = [];
    provider.analyzeChapter = async (input, qualityFeedback) => {
      feedback.push(qualityFeedback);
      if (qualityFeedback) return analysisFor(input);
      const invalid = analysisFor(input);
      invalid.claims[0]!.statement = "2008年基尼系数达到0.491。";
      return invalid;
    };

    const result = await createOrReuseTargetChapterAnalyses({
      source,
      map,
      chaptersDirectory: directory,
      provider,
    });

    expect(feedback).toHaveLength(2);
    expect(feedback[0]).toBeUndefined();
    expect(feedback[1]?.join(" ")).toContain("SEVERE_EXCERPT_MISMATCH");
    expect(result.analyses[0]!.quality).toMatchObject({status: "PASS", blockingIssues: []});
    expect(result.unsupportedClaimsRemoved).toBeGreaterThanOrEqual(1);
  });

  it("feeds a malformed provider-output issue back once before accepting a valid repair", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    map.phase3BTargets = [map.phase3BTargets[0]!];
    const provider = new SyntheticProvider();
    const feedback: Array<string[] | undefined> = [];
    provider.analyzeChapter = async (input, qualityFeedback) => {
      feedback.push(qualityFeedback);
      if (!qualityFeedback) {
        throw new ChapterDeepReadOutputError(["evidence.2.type must use an allowed Evidence type"]);
      }
      return analysisFor(input);
    };

    const result = await createOrReuseTargetChapterAnalyses({
      source,
      map,
      chaptersDirectory: directory,
      provider,
    });

    expect(feedback).toHaveLength(2);
    expect(feedback[1]).toEqual([
      "PROVIDER_OUTPUT_INVALID: evidence.2.type must use an allowed Evidence type",
    ]);
    expect(result.analyses[0]!.quality.status).toBe("PASS");
  });

  it("counts a causal overclaim corrected by the one allowed model repair", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    map.phase3BTargets = [map.phase3BTargets[0]!];
    const provider = new SyntheticProvider();
    provider.analyzeChapter = async (input, qualityFeedback) => {
      if (qualityFeedback) return analysisFor(input);
      const invalid = analysisFor(input);
      invalid.claims[0]!.statement = `${input.blocks[0]!.originalText}导致本章未讨论的普遍结果。`;
      return invalid;
    };

    const result = await createOrReuseTargetChapterAnalyses({
      source,
      map,
      chaptersDirectory: directory,
      provider,
    });

    expect(result.causalOverclaimsCorrected).toBe(1);
    expect(result.blockingTraceabilityIssues).toEqual([]);
  });

  it("marks a chapter NEEDS_REVIEW after one failed repair and removes stale PASS output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chapter-deep-read-"));
    temporaryDirectories.push(directory);
    const {source, map} = await loadInputs();
    map.phase3BTargets = [map.phase3BTargets[0]!];
    const provider = new SyntheticProvider();
    provider.analyzeChapter = async (input) => {
      provider.calls.push(structuredClone(input));
      const invalid = analysisFor(input);
      invalid.claims[0]!.statement = "市场机制导致2008年基尼系数达到0.491。";
      return invalid;
    };

    const result = await createOrReuseTargetChapterAnalyses({
      source,
      map,
      chaptersDirectory: directory,
      provider,
      createdAt: "2026-08-13T00:00:00.000Z",
    });

    expect(provider.calls).toHaveLength(2);
    expect(result.analyses).toEqual([]);
    expect(result.needsReview).toEqual(["chapter-micro-retrospective"]);
    expect(result.blockingTraceabilityIssues).toEqual(expect.arrayContaining([
      expect.stringContaining("CAUSAL_OVERCLAIM"),
      expect.stringContaining("SEVERE_EXCERPT_MISMATCH"),
    ]));
    await expect(readFile(join(directory, "chapter-micro-retrospective.json"), "utf8"))
      .rejects.toMatchObject({code: "ENOENT"});
    const review = JSON.parse(await readFile(
      join(directory, "chapter-micro-retrospective.needs-review.json"),
      "utf8",
    )) as {status: string; attempts: number; issues: string[]; candidate: ChapterAnalysis};
    expect(review).toMatchObject({status: "NEEDS_REVIEW", attempts: 2});
    expect(review.issues).not.toHaveLength(0);
    expect(review.candidate.quality.status).toBe("NEEDS_REVIEW");
  });

  it("flags templated scope, one evidence type, and repeated cross-chapter claims", async () => {
    const {source, map} = await loadInputs();
    const firstInput = {
      chapterId: map.chapters[0]!.chapterId,
      title: map.chapters[0]!.title,
      chapterRole: map.chapters[0]!.role,
      chapterSummary: map.chapters[0]!.summary,
      importance: map.chapters[0]!.importance,
      targetPriority: 1,
      targetReason: "需要进一步深读。",
      chapterCatalog: [],
      blocks: [source.pages[0]!.contentBlocks[0]!],
    } satisfies ChapterDeepReadInput;
    const secondInput = {
      ...firstInput,
      chapterId: map.chapters[1]!.chapterId,
      title: map.chapters[1]!.title,
      blocks: [source.pages[1]!.contentBlocks[0]!],
    };
    const first = analysisFor(firstInput);
    const second = analysisFor(secondInput);
    second.claims[0]!.statement = first.claims[0]!.statement;
    first.claims[0]!.scope = {
      appliesTo: ["适用范围"],
      doesNotNecessarilyApplyTo: ["不适用范围"],
    };
    first.evidence = first.evidence.filter((item) => item.type === "logical_argument");
    second.evidence = second.evidence.filter((item) => item.type === "logical_argument");

    expect(validateChapterAnalysisSet([first, second])).toEqual(expect.arrayContaining([
      expect.stringContaining("scope template"),
      expect.stringContaining("at least 2 evidence types"),
      expect.stringContaining("repeated across chapters"),
    ]));
  });

  it("accepts a chapter with one honest evidence type when the analysis set has diversity", async () => {
    const {source, map} = await loadInputs();
    const firstInput = {
      chapterId: map.chapters[0]!.chapterId,
      title: map.chapters[0]!.title,
      chapterRole: map.chapters[0]!.role,
      chapterSummary: map.chapters[0]!.summary,
      importance: map.chapters[0]!.importance,
      targetPriority: 1,
      targetReason: "需要进一步深读。",
      chapterCatalog: [],
      blocks: [source.pages[0]!.contentBlocks[0]!],
    } satisfies ChapterDeepReadInput;
    const secondInput = {
      ...firstInput,
      chapterId: map.chapters[1]!.chapterId,
      title: map.chapters[1]!.title,
      blocks: [source.pages[1]!.contentBlocks[0]!],
    };
    const first = analysisFor(firstInput);
    const second = analysisFor(secondInput);
    first.evidence = first.evidence.filter((item) => item.type === "logical_argument");
    second.evidence = second.evidence.filter((item) => item.type === "author_observation");

    expect(validateChapterAnalysisSet([first, second]).filter((issue) => (
      issue.includes("at least 2 evidence types")
    ))).toEqual([]);
  });
});
