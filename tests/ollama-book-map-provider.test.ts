import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {buildBookMapEvidencePack} from "../src/research/book/book-map-input";
import {
  createOllamaBookMapProviderFromEnv,
} from "../src/research/book/ollama-book-map-provider";
import type {MiniChapterMap, WholeBookSynthesis} from "../src/research/book/book-map-stages";
import {BookSourceSchema} from "../src/research/book/source-schema";

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const loadStageFixtures = async (): Promise<{
  evidence: ReturnType<typeof buildBookMapEvidencePack>;
  minis: MiniChapterMap[];
  synthesis: WholeBookSynthesis;
}> => {
  const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
  const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
  return {
    evidence: buildBookMapEvidencePack(source),
    minis: map.chapters.map((chapter) => ({
      analysisStatus: chapter.analysisStatus,
      chapterId: chapter.chapterId,
      title: chapter.title,
      role: chapter.role,
      oneSentenceSummary: chapter.summary,
      keyConcepts: ["行动反馈"],
      candidateTheses: ["候选命题需要下一轮验证。"],
      importance: chapter.importance,
      deepReadPriority: chapter.deepReadPriority,
      sourceRefs: chapter.sourceRefs,
      analysisConfidence: 0.8,
    })),
    synthesis: {
      analysisLanguage: "zh-CN",
      coreProblem: map.coreProblem,
      candidateCoreTheses: map.candidateCoreTheses,
      structureOverview: map.structureOverview,
      recurringConcepts: map.recurringConcepts,
      chapterImportanceRanking: map.chapters.map((chapter) => ({
        chapterId: chapter.chapterId,
        importance: chapter.importance,
        deepReadPriority: chapter.deepReadPriority,
        reason: "通过全书比较确定本章位置。",
      })),
      phase3BTargets: map.phase3BTargets,
      warnings: map.warnings,
    },
  };
};

const responseFor = (value: unknown): Response => new Response(JSON.stringify({
  model: "qwen3:14b",
  message: {role: "assistant", content: JSON.stringify(value)},
  done: true,
}), {status: 200});

describe("Ollama Book Map provider adapter", () => {
  it("uses local Ollama with qwen3:14b by default and allows a model override", () => {
    expect(createOllamaBookMapProviderFromEnv({env: {}}).model).toBe("qwen3:14b");
    expect(createOllamaBookMapProviderFromEnv({
      env: {OLLAMA_BOOK_MAP_MODEL: "qwen3:32b"},
    }).model).toBe("qwen3:32b");
  });

  it("analyzes one chapter with only that chapter's evidence and non-fixed refs", async () => {
    const {evidence, minis} = await loadStageFixtures();
    let requestUrl = "";
    let requestBody: Record<string, unknown> = {};
    const provider = createOllamaBookMapProviderFromEnv({
      env: {},
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return responseFor(minis[0]);
      },
    });

    await expect(provider.analyzeChapter(evidence.chapters[0]!)).resolves.toEqual(minis[0]);
    expect(requestUrl).toBe("http://127.0.0.1:11434/api/chat");
    const messages = requestBody.messages as Array<{role: string; content: string}>;
    const sent = JSON.parse(messages[1]!.content) as {chapterId: string; blocks: unknown[]};
    expect(sent.chapterId).toBe(evidence.chapters[0]!.chapterId);
    expect(sent.blocks).toHaveLength(evidence.chapters[0]!.blocks.length);
    expect(messages[0]!.content).toContain("只分析当前章节");
    const format = requestBody.format as {properties: {sourceRefs: {maxItems: number}}};
    expect(format.properties.sourceRefs.maxItems).toBe(8);
  });

  it("synthesizes only MiniChapterMaps and requires whole-book ranking/3-8 targets", async () => {
    const {evidence, minis, synthesis} = await loadStageFixtures();
    const expandedMinis = Array.from({length: 24}, (_, index) => ({
      ...structuredClone(minis[index % minis.length]!),
      chapterId: `chapter-${String(index + 1).padStart(3, "0")}`,
      title: `第${index + 1}章`,
    }));
    const expandedSynthesis = {
      ...synthesis,
      chapterImportanceRanking: expandedMinis.map((mini, index) => ({
        chapterId: mini.chapterId,
        importance: 40 + index,
        deepReadPriority: index % 3 === 0 ? "high" as const : "medium" as const,
        reason: "通过全书比较确定。",
      })),
      phase3BTargets: expandedMinis.slice(0, 4).map((mini, index) => ({
        chapterId: mini.chapterId,
        priority: 90 - index,
        reason: "需要进一步深读以核验核心论证与边界。",
        sourceRefs: mini.sourceRefs,
      })),
    };
    let requestBody: Record<string, unknown> = {};
    const provider = createOllamaBookMapProviderFromEnv({
      env: {},
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return responseFor(expandedSynthesis);
      },
    });

    await provider.synthesize({
      metadata: evidence.metadata,
      structure: evidence.structure,
      miniChapterMaps: expandedMinis,
      excludedLowConfidencePages: evidence.excludedLowConfidencePages,
    });

    const messages = requestBody.messages as Array<{role: string; content: string}>;
    expect(messages[0]!.content).toContain("24 个 MiniChapterMap");
    expect(messages[0]!.content).toContain("为什么需要进一步深读");
    expect(messages[1]!.content).not.toContain("originalText");
    const format = requestBody.format as {properties: Record<string, {minItems?: number; maxItems?: number}>};
    expect(format.properties.chapterImportanceRanking).toMatchObject({minItems: 24, maxItems: 24});
    expect(format.properties.phase3BTargets).toMatchObject({minItems: 3, maxItems: 8});
  });

  it("rejects malformed stage output and assembles streamed JSON chunks", async () => {
    const {evidence, minis} = await loadStageFixtures();
    const serialized = JSON.stringify(minis[0]);
    const splitAt = Math.floor(serialized.length / 2);
    const provider = createOllamaBookMapProviderFromEnv({
      env: {},
      fetch: async () => new Response([
        JSON.stringify({message: {content: serialized.slice(0, splitAt)}, done: false}),
        JSON.stringify({message: {content: serialized.slice(splitAt)}, done: true}),
      ].join("\n"), {status: 200}),
    });
    await expect(provider.analyzeChapter(evidence.chapters[0]!)).resolves.toEqual(minis[0]);

    const invalidProvider = createOllamaBookMapProviderFromEnv({
      env: {},
      fetch: async () => responseFor({analysisLanguage: "en"}),
    });
    await expect(invalidProvider.analyzeChapter(evidence.chapters[0]!)).rejects.toThrow();
  });

  it("samples an oversized chapter evenly while retaining real source references", async () => {
    const {evidence, minis} = await loadStageFixtures();
    const chapter = structuredClone(evidence.chapters[0]!);
    const prototype = chapter.blocks[0]!;
    chapter.blocks = Array.from({length: 500}, (_, index) => ({
      ...prototype,
      blockId: `p${index + 1}-b1`,
      page: index + 1,
      originalText: `第 ${index + 1} 页的真实证据。`,
    }));
    let sent: typeof chapter | undefined;
    const provider = createOllamaBookMapProviderFromEnv({
      env: {},
      fetch: async (_request, init) => {
        const body = JSON.parse(String(init?.body)) as {messages: Array<{content: string}>};
        sent = JSON.parse(body.messages[1]!.content) as typeof chapter;
        return responseFor({...minis[0], sourceRefs: [{
          type: "book", chapterId: chapter.chapterId, page: 1, blockId: "p1-b1",
        }]});
      },
    });

    await provider.analyzeChapter(chapter);
    expect(sent!.blocks.length).toBeLessThanOrEqual(48);
    expect(sent!.blocks[0]?.blockId).toBe("p1-b1");
    expect(sent!.blocks.at(-1)?.blockId).toBe("p500-b1");
  });
});
