import {z} from "zod";
import {
  BookMapDraftSchema,
  BookMapStructuredOutputSchema,
  type BookMapDraft,
} from "./book-map-schema";
import type {BookMapEvidencePack} from "./book-map-input";
import type {BookMapProvider} from "./book-map-provider";

const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_OLLAMA_BOOK_MAP_MODEL = "qwen3:14b";
const MAX_OLLAMA_EVIDENCE_BLOCKS = 120;
const MIN_OLLAMA_OUTPUT_TOKENS = 3_072;
const OLLAMA_OUTPUT_TOKENS_PER_CHAPTER = 512;

const createStructuredOutputSchema = (
  input: BookMapEvidencePack,
): Record<string, unknown> => {
  const generated = z.toJSONSchema(BookMapStructuredOutputSchema, {target: "draft-7"});
  const {$schema: _schemaDeclaration, ...schema} = generated;
  const constrainForOllama = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(constrainForOllama);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "array") {
      const minimum = typeof record.minItems === "number" ? record.minItems : 0;
      record.maxItems = Math.max(minimum, 3);
    }
    for (const [key, child] of Object.entries(record)) {
      if (key === "pattern" && typeof child === "string") {
        record[key] = child.replaceAll("\\d", "[0-9]");
      } else {
        constrainForOllama(child);
      }
    }
  };
  constrainForOllama(schema);
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  properties.chapters!.minItems = input.chapters.length;
  properties.chapters!.maxItems = input.chapters.length;
  properties.excludedLowConfidencePages!.minItems = input.excludedLowConfidencePages.length;
  properties.excludedLowConfidencePages!.maxItems = input.excludedLowConfidencePages.length;
  return schema;
};

const BOOK_MAP_INSTRUCTIONS = [
  "你是 Book Deep Reading Round 1 全书鸟瞰分析器。",
  "所有分析字段必须使用简体中文；原文专有名词可保留。",
  "只能使用输入 evidence pack 中提供的书籍内容，不得补充原书没有的事实，不得使用外部知识。",
  "每个实质判断必须引用输入中真实存在的 chapterId、page、blockId。",
  "候选核心命题只是下一轮待验证假设，不得写成已经完成 Claim 深读的结论。",
  "没有 blocks 的章节必须标为 insufficient_evidence，重要性设为 0，deepReadPriority 设为 low，sourceRefs 为空。",
  "有 blocks 的章节必须标为 analyzed，并引用该章节输入中真实存在的 source refs。",
  "recurringConcepts 中的每个 chapterId 都必须在该概念的 sourceRefs 中至少有一条同 chapterId 引用。",
  "保持输出简洁；每个判断最多引用三个最直接的 source refs。",
  "不要进行逐章 Claim/Evidence 深读、外部核验、视频选题或脚本创作。",
].join("\n");

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface OllamaBookMapProviderOptions {
  model: string;
  fetch?: Fetch;
}

interface CreateFromEnvOptions {
  env?: Record<string, string | undefined>;
  fetch?: Fetch;
}

interface OllamaChatResponse {
  message?: {content?: string};
  error?: string;
}

const readOllamaChatResponse = async (response: Response): Promise<OllamaChatResponse> => {
  if (!response.body) return {};
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let error: string | undefined;

  const consumeLine = (line: string): void => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as OllamaChatResponse;
    content += chunk.message?.content ?? "";
    error ??= chunk.error;
  };

  while (true) {
    const {done, value} = await reader.read();
    pending += decoder.decode(value, {stream: !done});
    let newlineIndex = pending.indexOf("\n");
    while (newlineIndex !== -1) {
      consumeLine(pending.slice(0, newlineIndex));
      pending = pending.slice(newlineIndex + 1);
      newlineIndex = pending.indexOf("\n");
    }
    if (done) break;
  }
  consumeLine(pending);

  return {message: {content}, error};
};

const sampleEvenly = <T>(items: T[], limit: number): T[] => {
  if (items.length <= limit) return items;
  if (limit === 1) return [items[0]!];
  return Array.from({length: limit}, (_, index) => (
    items[Math.round(index * (items.length - 1) / (limit - 1))]!
  ));
};

const compactEvidencePack = (input: BookMapEvidencePack): BookMapEvidencePack => {
  const blocksPerChapter = Math.max(
    1,
    Math.floor(MAX_OLLAMA_EVIDENCE_BLOCKS / input.chapters.length),
  );
  return {
    ...input,
    chapters: input.chapters.map((chapter) => ({
      ...chapter,
      blocks: sampleEvenly(chapter.blocks, blocksPerChapter),
    })),
  };
};

export class OllamaBookMapProvider implements BookMapProvider {
  readonly provider = "ollama";
  readonly model: string;
  private readonly request: Fetch;

  constructor({model, fetch: request = fetch}: OllamaBookMapProviderOptions) {
    this.model = model;
    this.request = request;
  }

  async analyze(input: BookMapEvidencePack): Promise<BookMapDraft> {
    const compactInput = compactEvidencePack(input);
    const outputTokenBudget = Math.max(
      MIN_OLLAMA_OUTPUT_TOKENS,
      compactInput.chapters.length * OLLAMA_OUTPUT_TOKENS_PER_CHAPTER,
    );
    const response = await this.request(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: this.model,
        stream: true,
        think: false,
        format: createStructuredOutputSchema(compactInput),
        options: {num_ctx: 32768, num_predict: outputTokenBudget, temperature: 0},
        messages: [
          {role: "system", content: BOOK_MAP_INSTRUCTIONS},
          {role: "user", content: JSON.stringify(compactInput)},
        ],
      }),
    });
    const responseBody = await readOllamaChatResponse(response);
    if (!response.ok) {
      throw new Error(
        `Ollama Book Map request failed (${response.status}): ${responseBody.error ?? "unknown error"}`,
      );
    }
    const content = responseBody.message?.content;
    if (!content?.trim()) throw new Error("Ollama Book Map response contained no content");

    return BookMapDraftSchema.parse(JSON.parse(content));
  }
}

export const createOllamaBookMapProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: CreateFromEnvOptions = {}): OllamaBookMapProvider => new OllamaBookMapProvider({
  model: env.OLLAMA_BOOK_MAP_MODEL?.trim() || DEFAULT_OLLAMA_BOOK_MAP_MODEL,
  fetch: request,
});
