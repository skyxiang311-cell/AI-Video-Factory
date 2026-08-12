import {describe, expect, it} from "vitest";
import {createDefaultBookMapProviderFromEnv} from "../src/research/book/book-map-provider-factory";
import {OpenAIBookMapProvider} from "../src/research/book/openai-book-map-provider";

describe("Book Map provider selection", () => {
  it("defaults to local Ollama without requiring an API key", () => {
    const provider = createDefaultBookMapProviderFromEnv({env: {}});

    expect(provider.provider).toBe("ollama");
    expect(provider.model).toBe("qwen3:14b");
  });

  it("keeps the OpenAI provider adapter available", () => {
    const provider = new OpenAIBookMapProvider({
      apiKey: "test-key",
      model: "synthetic-openai-model",
      fetch: async () => new Response("{}"),
    });

    expect(provider.provider).toBe("openai-responses");
  });
});
