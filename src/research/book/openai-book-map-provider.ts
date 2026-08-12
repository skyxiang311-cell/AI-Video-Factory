import {z} from "zod";
import {
  BookMapDraftSchema,
  BookMapStructuredOutputSchema,
  type BookMapDraft,
} from "./book-map-schema";
import type {BookMapEvidencePack} from "./book-map-input";
import type {BookMapProvider} from "./book-map-provider";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const createStructuredOutputSchema = (): Record<string, unknown> => {
  const generated = z.toJSONSchema(BookMapStructuredOutputSchema, {target: "draft-7"});
  const {$schema: _schemaDeclaration, ...schema} = generated;
  return schema;
};

const BOOK_MAP_INSTRUCTIONS = [
  "你是 Book Deep Reading Round 1 全书鸟瞰分析器。",
  "所有分析字段必须使用简体中文；原文专有名词可保留。",
  "只能使用输入 evidence pack 中提供的书籍内容，不得补充原书没有的事实，不得使用外部知识。",
  "每个实质判断必须引用输入中真实存在的 chapterId、page、blockId。",
  "候选核心命题只是下一轮待验证假设，不得写成已经完成 Claim 深读的结论。",
  "没有 blocks 的章节必须标为 insufficient_evidence，重要性设为 0，deepReadPriority 设为 low，sourceRefs 为空。",
  "不要进行逐章 Claim/Evidence 深读、外部核验、视频选题或脚本创作。",
].join("\n");

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface OpenAIBookMapProviderOptions {
  apiKey: string;
  model: string;
  fetch?: Fetch;
}

interface CreateFromEnvOptions {
  env?: Record<string, string | undefined>;
  fetch?: Fetch;
}

interface OpenAIResponseBody {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{type?: string; text?: string}>;
  }>;
  error?: {message?: string};
}

const extractOutputText = (response: OpenAIResponseBody): string | null => {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
};

export class OpenAIBookMapProvider implements BookMapProvider {
  readonly provider = "openai-responses";
  readonly model: string;
  private readonly apiKey: string;
  private readonly request: Fetch;

  constructor({apiKey, model, fetch: request = fetch}: OpenAIBookMapProviderOptions) {
    this.apiKey = apiKey;
    this.model = model;
    this.request = request;
  }

  async analyze(input: BookMapEvidencePack): Promise<BookMapDraft> {
    const response = await this.request(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        instructions: BOOK_MAP_INSTRUCTIONS,
        input: JSON.stringify(input),
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "book_map_round_1",
            strict: true,
            schema: createStructuredOutputSchema(),
          },
        },
      }),
    });
    const responseBody = await response.json() as OpenAIResponseBody;
    if (!response.ok) {
      throw new Error(
        `OpenAI Book Map request failed (${response.status}): ${responseBody.error?.message ?? "unknown error"}`,
      );
    }
    const outputText = extractOutputText(responseBody);
    if (!outputText) throw new Error("OpenAI Book Map response contained no output text");

    return BookMapDraftSchema.parse(JSON.parse(outputText));
  }
}

export const createOpenAIBookMapProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: CreateFromEnvOptions = {}): OpenAIBookMapProvider => {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for book:map");
  const model = env.OPENAI_BOOK_MAP_MODEL?.trim();
  if (!model) throw new Error("OPENAI_BOOK_MAP_MODEL is required for book:map");

  return new OpenAIBookMapProvider({apiKey, model, fetch: request});
};
