import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {buildBookMapEvidencePack} from "../src/research/book/book-map-input";
import {
  createOllamaBookMapProviderFromEnv,
} from "../src/research/book/ollama-book-map-provider";
import {BookSourceSchema} from "../src/research/book/source-schema";

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

describe("Ollama Book Map provider adapter", () => {
  it("uses local Ollama with qwen3:14b by default and allows a model override", () => {
    expect(createOllamaBookMapProviderFromEnv({env: {}}).model).toBe("qwen3:14b");
    expect(createOllamaBookMapProviderFromEnv({
      env: {OLLAMA_BOOK_MAP_MODEL: "qwen3:32b"},
    }).model).toBe("qwen3:32b");
  });

  it("requests structured JSON and parses a Schema-valid draft", async () => {
    const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
    const {artifact: _artifact, provider: _provider, ...draft} = map;
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const provider = createOllamaBookMapProviderFromEnv({
      env: {},
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response(JSON.stringify({
          model: "qwen3:14b",
          message: {role: "assistant", content: JSON.stringify(draft)},
          done: true,
        }), {status: 200});
      },
    });

    const result = await provider.analyze(buildBookMapEvidencePack(source));

    expect(result).toEqual(draft);
    expect(provider.provider).toBe("ollama");
    expect(requestUrl).toBe("http://127.0.0.1:11434/api/chat");
    expect(requestInit?.headers).toMatchObject({"Content-Type": "application/json"});
    const body = JSON.parse(String(requestInit?.body)) as {
      model: string;
      stream: boolean;
      think: boolean;
      format: Record<string, unknown>;
      options: {num_ctx: number; num_predict: number; temperature: number};
      messages: Array<{role: string; content: string}>;
    };
    expect(body.model).toBe("qwen3:14b");
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.options).toEqual({num_ctx: 32768, num_predict: 3072, temperature: 0});
    expect(body.format).not.toHaveProperty("$schema");
    expect(JSON.stringify(body.format)).not.toContain('"oneOf"');
    expect(JSON.stringify(body.format)).not.toContain("\\\\d");
    expect(JSON.stringify(body.format)).toContain("[0-9]");
    const topLevelProperties = body.format.properties as Record<string, {
      minItems?: number;
      maxItems?: number;
    }>;
    expect(topLevelProperties.chapters).toMatchObject({minItems: 2, maxItems: 2});
    expect(topLevelProperties.candidateCoreTheses?.maxItems).toBe(3);
    expect(body.messages[0]).toMatchObject({role: "system"});
    expect(body.messages[0]?.content).toContain("简体中文");
    expect(body.messages[0]?.content).toContain("有 blocks 的章节必须标为 analyzed");
    expect(body.messages[1]?.content).toContain("p1-bmicro-retrospective");
  });

  it("rejects malformed model output", async () => {
    const provider = createOllamaBookMapProviderFromEnv({
      env: {},
      fetch: async () => new Response(JSON.stringify({
        model: "qwen3:14b",
        message: {role: "assistant", content: JSON.stringify({analysisLanguage: "en"})},
        done: true,
      }), {status: 200}),
    });
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));

    await expect(provider.analyze(buildBookMapEvidencePack(source))).rejects.toThrow();
  });

  it("samples oversized evidence evenly while retaining real source references", async () => {
    const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
    const {artifact: _artifact, provider: _provider, ...draft} = map;
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    const input = buildBookMapEvidencePack(source);
    const prototype = input.chapters[0]!.blocks[0]!;
    input.chapters[0]!.blocks = Array.from({length: 500}, (_, index) => ({
      ...prototype,
      blockId: `p${index + 1}-b1`,
      page: index + 1,
      originalText: `第 ${index + 1} 页的真实证据。`,
    }));
    let sentInput: typeof input | undefined;
    const provider = createOllamaBookMapProviderFromEnv({
      env: {},
      fetch: async (_request, init) => {
        const body = JSON.parse(String(init?.body)) as {
          messages: Array<{content: string}>;
        };
        sentInput = JSON.parse(body.messages[1]!.content) as typeof input;
        return new Response(JSON.stringify({
          model: "qwen3:14b",
          message: {role: "assistant", content: JSON.stringify(draft)},
          done: true,
        }), {status: 200});
      },
    });

    await provider.analyze(input);

    const sentBlocks = sentInput?.chapters[0]?.blocks ?? [];
    expect(sentBlocks.length).toBeLessThanOrEqual(120);
    expect(sentBlocks[0]?.blockId).toBe("p1-b1");
    expect(sentBlocks.at(-1)?.blockId).toBe("p500-b1");
    expect(new Set(sentBlocks.map((block) => block.page)).size).toBe(sentBlocks.length);
  });
});
