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

const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_OLLAMA_BOOK_MAP_MODEL = "qwen3:14b";
const MAX_CHAPTER_EVIDENCE_BLOCKS = 48;

const MINI_CHAPTER_INSTRUCTIONS = [
  "你是 Book Deep Reading Round 1 的逐章分析器；只分析当前章节。",
  "所有分析字段用简体中文，原文专有名词可保留。",
  "只能使用输入中当前章节的 evidence blocks，不得使用外部知识或补充原书没有的事实。",
  "摘要必须具体概括本章内容，避免‘本章介绍/分析/探讨/讨论了’等模板句式。",
  "importance 为本章对理解全书的初始绝对评分 0-100；全书相对排序由下一阶段完成。",
  "sourceRefs 只引用输入里真实存在的 chapterId/page/blockId，按判断所需选择 1-8 条，不要机械固定数量。",
  "candidateTheses 只是下一轮待验证假设，不得伪装成已完成的 Claim/Evidence 深读。",
  "不要做外部核验、视频选题或脚本创作。",
].join("\n");

const wholeBookInstructions = (chapterCount: number): string => [
  `你是 Book Deep Reading Round 1 的全书综合分析器。输入包含 ${chapterCount} 个 MiniChapterMap。`,
  "只比较输入的 MiniChapterMap，不得使用外部知识，不得补充原书没有的事实。",
  "所有分析字段用简体中文，原文专有名词可保留。",
  "必须覆盖所有章节并给出全书相对 importance 排名；不得全部相同，至少形成 3 个不同分值档位。",
  "评分时先按全书贡献排序：最高层 90-100、关键支撑层 75-89、补充或案例层 50-74；必须依据各章角色拉开分值，禁止统一给 0、80 或任何相同分数。",
  "前半本与后半本必须公平参与比较，不得按章节顺序机械降分。",
  "Phase3BTargets 必须从全书比较后选择 3-8 章，不能机械只选开头章节。",
  "每个推荐理由必须明确说明为什么需要进一步深读，例如需要核验的论证、关键概念、证据链或适用边界。",
  "sourceRefs 只能复用 MiniChapterMap 中已有的真实引用，按实际论证需要选择，不要固定条数。",
  "不要进行 Phase 3B Claim/Evidence 深读、外部核验、视频选题或脚本创作。",
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

const toOllamaSchema = (schema: z.ZodType): Record<string, unknown> => {
  const generated = z.toJSONSchema(schema, {target: "draft-7"});
  const {$schema: _schemaDeclaration, ...result} = generated;
  const normalize = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(normalize);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "array" && typeof record.maxItems !== "number") {
      record.maxItems = Math.max(typeof record.minItems === "number" ? record.minItems : 0, 2);
    }
    for (const [key, child] of Object.entries(record)) {
      if (key === "pattern" && typeof child === "string") record[key] = child.replaceAll("\\d", "[0-9]");
      else normalize(child);
    }
  };
  normalize(result);
  return result;
};

const createWholeBookSchema = (
  chapterCount: number,
  analyzedChapterCount: number,
): Record<string, unknown> => {
  const schema = toOllamaSchema(WholeBookSynthesisSchema);
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  properties.candidateCoreTheses!.maxItems = 3;
  properties.recurringConcepts!.maxItems = 4;
  const structureProperties = properties.structureOverview!.properties as Record<string, Record<string, unknown>>;
  structureProperties.parts!.maxItems = 4;
  properties.chapterImportanceRanking!.minItems = chapterCount;
  properties.chapterImportanceRanking!.maxItems = chapterCount;
  properties.phase3BTargets!.minItems = analyzedChapterCount >= 3 ? 3 : Math.min(1, analyzedChapterCount);
  properties.phase3BTargets!.maxItems = Math.min(8, analyzedChapterCount);
  return schema;
};

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

export class OllamaBookMapProvider implements BookMapProvider {
  readonly provider = "ollama";
  readonly model: string;
  private readonly request: Fetch;

  constructor({model, fetch: request = fetch}: OllamaBookMapProviderOptions) {
    this.model = model;
    this.request = request;
  }

  private async requestStructured<T>(
    instructions: string,
    input: unknown,
    schema: z.ZodType<T>,
    format: Record<string, unknown>,
    options: {num_ctx: number; num_predict: number},
  ): Promise<T> {
    const response = await this.request(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: this.model,
        stream: true,
        think: false,
        format,
        options: {...options, temperature: 0},
        messages: [
          {role: "system", content: instructions},
          {role: "user", content: JSON.stringify(input)},
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
    return schema.parse(JSON.parse(content));
  }

  async analyzeChapter(input: MiniChapterEvidence): Promise<MiniChapterMap> {
    const compactInput = {
      ...input,
      blocks: sampleEvenly(input.blocks, MAX_CHAPTER_EVIDENCE_BLOCKS),
    };
    return this.requestStructured(
      MINI_CHAPTER_INSTRUCTIONS,
      compactInput,
      MiniChapterMapSchema,
      toOllamaSchema(MiniChapterMapSchema),
      {num_ctx: 8192, num_predict: 1536},
    );
  }

  async synthesize(
    input: WholeBookSynthesisInput,
    qualityFeedback?: string[],
  ): Promise<WholeBookSynthesis> {
    const analyzedCount = input.miniChapterMaps.filter((mini) => mini.analysisStatus === "analyzed").length;
    const correction = qualityFeedback?.length
      ? `\n上一次综合结果未通过质量门，必须修正以下问题：\n- ${qualityFeedback.join("\n- ")}\n请重新比较全部章节，禁止重复上一次不合格的分值与目标选择。`
      : "";
    return this.requestStructured(
      wholeBookInstructions(input.miniChapterMaps.length) + correction,
      input,
      WholeBookSynthesisSchema,
      createWholeBookSchema(input.miniChapterMaps.length, analyzedCount),
      {num_ctx: 32768, num_predict: 6144},
    );
  }
}

export const createOllamaBookMapProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: CreateFromEnvOptions = {}): OllamaBookMapProvider => new OllamaBookMapProvider({
  model: env.OLLAMA_BOOK_MAP_MODEL?.trim() || DEFAULT_OLLAMA_BOOK_MAP_MODEL,
  fetch: request,
});
