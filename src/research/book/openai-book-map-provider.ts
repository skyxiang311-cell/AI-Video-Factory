import {z} from "zod";
import type {BookMapProvider} from "./book-map-provider";
import {
  MiniChapterMapSchema,
  WholeBookSynthesisSchema,
  type MiniChapterEvidence,
  type MiniChapterMap,
  type WholeBookSynthesis,
  type WholeBookSynthesisInput,
} from "./book-map-stages";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MINI_INSTRUCTIONS = "只分析当前章节；所有分析字段用简体中文；只引用输入 evidence，不得补充事实；sourceRefs 按需选择；不要开始 Phase 3B。";
const SYNTHESIS_INSTRUCTIONS = "只根据 MiniChapterMap 做全书综合；公平比较所有章节，importance 至少三个档位，选择 3-8 个 Phase3BTargets 并说明为什么需要进一步深读；不要开始 Phase 3B。";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
interface Options {apiKey: string; model: string; fetch?: Fetch}
interface EnvOptions {env?: Record<string, string | undefined>; fetch?: Fetch}
interface OpenAIResponseBody {
  output_text?: string;
  output?: Array<{content?: Array<{type?: string; text?: string}>}>;
  error?: {message?: string};
}

const schemaJson = (schema: z.ZodType): Record<string, unknown> => {
  const generated = z.toJSONSchema(schema, {target: "draft-7"});
  const {$schema: _schemaDeclaration, ...result} = generated;
  return result;
};

const extractOutputText = (response: OpenAIResponseBody): string | null => {
  if (response.output_text?.trim()) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) return content.text;
    }
  }
  return null;
};

export class OpenAIBookMapProvider implements BookMapProvider {
  readonly provider = "openai-responses";
  readonly model: string;
  private readonly apiKey: string;
  private readonly request: Fetch;

  constructor({apiKey, model, fetch: request = fetch}: Options) {
    this.apiKey = apiKey;
    this.model = model;
    this.request = request;
  }

  private async requestStructured<T>(
    instructions: string,
    input: unknown,
    schema: z.ZodType<T>,
    name: string,
  ): Promise<T> {
    const response = await this.request(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json"},
      body: JSON.stringify({
        model: this.model,
        instructions,
        input: JSON.stringify(input),
        store: false,
        text: {format: {type: "json_schema", name, strict: true, schema: schemaJson(schema)}},
      }),
    });
    const body = await response.json() as OpenAIResponseBody;
    if (!response.ok) {
      throw new Error(`OpenAI Book Map request failed (${response.status}): ${body.error?.message ?? "unknown error"}`);
    }
    const text = extractOutputText(body);
    if (!text) throw new Error("OpenAI Book Map response contained no output text");
    return schema.parse(JSON.parse(text));
  }

  async analyzeChapter(input: MiniChapterEvidence): Promise<MiniChapterMap> {
    return this.requestStructured(MINI_INSTRUCTIONS, input, MiniChapterMapSchema, "mini_chapter_map");
  }

  async synthesize(
    input: WholeBookSynthesisInput,
    qualityFeedback?: string[],
  ): Promise<WholeBookSynthesis> {
    const correction = qualityFeedback?.length
      ? `\n必须修正上一次质量问题：${qualityFeedback.join("；")}`
      : "";
    return this.requestStructured(
      SYNTHESIS_INSTRUCTIONS + correction,
      input,
      WholeBookSynthesisSchema,
      "whole_book_synthesis",
    );
  }
}

export const createOpenAIBookMapProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: EnvOptions = {}): OpenAIBookMapProvider => {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for book:map");
  const model = env.OPENAI_BOOK_MAP_MODEL?.trim();
  if (!model) throw new Error("OPENAI_BOOK_MAP_MODEL is required for book:map");
  return new OpenAIBookMapProvider({apiKey, model, fetch: request});
};
