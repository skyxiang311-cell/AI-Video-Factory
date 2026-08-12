import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {buildBookMapEvidencePack} from "../src/research/book/book-map-input";
import {createOpenAIBookMapProviderFromEnv} from "../src/research/book/openai-book-map-provider";
import {BookSourceSchema} from "../src/research/book/source-schema";

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

describe("OpenAI Book Map provider adapter", () => {
  it("requires API key and model exclusively from environment configuration", () => {
    expect(() => createOpenAIBookMapProviderFromEnv({env: {}})).toThrow("OPENAI_API_KEY is required");
    expect(() => createOpenAIBookMapProviderFromEnv({env: {OPENAI_API_KEY: "test-key"}}))
      .toThrow("OPENAI_BOOK_MAP_MODEL is required");
  });

  it("preserves the two-stage provider contract with strict structured output", async () => {
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    const evidence = buildBookMapEvidencePack(source);
    const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
    const chapter = map.chapters[0]!;
    const mini = {
      analysisStatus: chapter.analysisStatus,
      chapterId: chapter.chapterId,
      title: chapter.title,
      role: chapter.role,
      oneSentenceSummary: chapter.summary,
      keyConcepts: ["行动反馈"],
      candidateTheses: ["候选命题需要验证。"],
      importance: chapter.importance,
      deepReadPriority: chapter.deepReadPriority,
      sourceRefs: chapter.sourceRefs,
      analysisConfidence: 0.8,
    };
    const bodies: Array<Record<string, unknown>> = [];
    const provider = createOpenAIBookMapProviderFromEnv({
      env: {OPENAI_API_KEY: "test-secret", OPENAI_BOOK_MAP_MODEL: "synthetic-model"},
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({output_text: JSON.stringify(mini)}), {status: 200});
      },
    });

    await expect(provider.analyzeChapter(evidence.chapters[0]!)).resolves.toEqual(mini);
    expect(provider.provider).toBe("openai-responses");
    expect(bodies[0]!.instructions).toContain("只分析当前章节");
    expect(bodies[0]!.input).not.toContain(evidence.chapters[1]!.chapterId);
    const text = bodies[0]!.text as {format: {name: string; strict: boolean}};
    expect(text.format).toMatchObject({name: "mini_chapter_map", strict: true});
  });

  it("rejects malformed chapter output", async () => {
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    const provider = createOpenAIBookMapProviderFromEnv({
      env: {OPENAI_API_KEY: "test-secret", OPENAI_BOOK_MAP_MODEL: "synthetic-model"},
      fetch: async () => new Response(JSON.stringify({output_text: "{}"}), {status: 200}),
    });
    await expect(provider.analyzeChapter(buildBookMapEvidencePack(source).chapters[0]!))
      .rejects.toThrow();
  });
});
