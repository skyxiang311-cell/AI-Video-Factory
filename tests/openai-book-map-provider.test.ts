import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {buildBookMapEvidencePack} from "../src/research/book/book-map-input";
import {
  createOpenAIBookMapProviderFromEnv,
} from "../src/research/book/openai-book-map-provider";
import {BookSourceSchema} from "../src/research/book/source-schema";

const loadFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

describe("OpenAI Book Map provider adapter", () => {
  it("requires API key and model exclusively from environment configuration", () => {
    expect(() => createOpenAIBookMapProviderFromEnv({env: {}})).toThrow(
      "OPENAI_API_KEY is required",
    );
    expect(() => createOpenAIBookMapProviderFromEnv({
      env: {OPENAI_API_KEY: "test-key"},
    })).toThrow("OPENAI_BOOK_MAP_MODEL is required");
  });

  it("requests strict structured output and parses a Schema-valid draft", async () => {
    const map = BookMapSchema.parse(await loadFixture("sample-book-map.json"));
    const {artifact: _artifact, provider: _provider, ...draft} = map;
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const provider = createOpenAIBookMapProviderFromEnv({
      env: {
        OPENAI_API_KEY: "test-secret",
        OPENAI_BOOK_MAP_MODEL: "synthetic-openai-model",
      },
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response(JSON.stringify({
          output: [{
            type: "message",
            content: [{type: "output_text", text: JSON.stringify(draft)}],
          }],
        }), {status: 200});
      },
    });

    const result = await provider.analyze(buildBookMapEvidencePack(source));

    expect(result).toEqual(draft);
    expect(provider.provider).toBe("openai-responses");
    expect(provider.model).toBe("synthetic-openai-model");
    expect(requestUrl).toBe("https://api.openai.com/v1/responses");
    expect(requestInit?.headers).toMatchObject({
      Authorization: "Bearer test-secret",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(requestInit?.body)) as {
      model: string;
      instructions: string;
      input: string;
      text: {format: {
        type: string;
        strict: boolean;
        name: string;
        schema: Record<string, unknown>;
      }};
    };
    expect(body.model).toBe("synthetic-openai-model");
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      name: "book_map_round_1",
    });
    expect(JSON.stringify(body.text.format.schema)).not.toContain('"oneOf"');
    expect(body.text.format.schema).not.toHaveProperty("$schema");
    expect(body.instructions).toContain("简体中文");
    expect(body.instructions).toContain("不得补充");
    expect(body.input).toContain("p1-bmicro-retrospective");
  });

  it("rejects a provider response that violates the Book Map draft Schema", async () => {
    const provider = createOpenAIBookMapProviderFromEnv({
      env: {
        OPENAI_API_KEY: "test-secret",
        OPENAI_BOOK_MAP_MODEL: "synthetic-openai-model",
      },
      fetch: async () => new Response(JSON.stringify({
        output: [{
          type: "message",
          content: [{type: "output_text", text: JSON.stringify({analysisLanguage: "en"})}],
        }],
      }), {status: 200}),
    });
    const source = BookSourceSchema.parse(await loadFixture("sample-book-source.json"));

    await expect(provider.analyze(buildBookMapEvidencePack(source))).rejects.toThrow();
  });
});
