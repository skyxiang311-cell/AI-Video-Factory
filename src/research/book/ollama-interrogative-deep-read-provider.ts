import {z} from "zod";
import type {
  InterrogativeDeepReadInput,
  InterrogativeDeepReadProvider,
} from "./interrogative-deep-read-provider";
import {
  InterrogativeDeepReadDraftSchema,
  type InterrogativeDeepReadDraft,
} from "./interrogative-deep-read-schema";

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const OLLAMA_CHAT_URL = `${OLLAMA_BASE_URL}/api/chat`;
const OLLAMA_TAGS_URL = `${OLLAMA_BASE_URL}/api/tags`;
const DEFAULT_MODEL = "qwen3:14b";
const PREFERRED_MODEL = "qwen3:30b";
const MAX_SOURCE_BLOCKS = 96;

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
interface ProviderOptions {model: string; fetch?: Fetch}
interface EnvOptions {env?: Record<string, string | undefined>; fetch?: Fetch}

const INSTRUCTIONS = [
  "你是 Book Deep Reading Phase 3C 质疑式二读分析器；只分析输入中的当前章节。",
  "所有输出统一使用简体中文，原文专有名词可保留。",
  "只使用 currentAnalysis、sourceBlocks 和 comparisonChapters，不得补充输入之外的事实。",
  "逐一判断原 Claim 是 fact、author_judgment 还是 inference；claimAssessments 必须覆盖全部原 Claim。",
  "evidenceLimits 必须逐一说明 Evidence 真正能证明和不能证明什么，并覆盖全部原 Claim。",
  "causalAssessment 必须覆盖全部原 Claim，区分 supported、association_only、overclaim、not_applicable。",
  "发现 Phase 3B Claim 过度概括时生成 revisedClaims，但不得篡改 originalClaims。",
  "检查时间、地区、样本、群体和条件限制；需要时生成 scopeCorrections。",
  "检查其他可能解释、隐藏假设以及与 comparisonChapters 的 tension 或 contradiction。",
  "contradictions 和 relationsToOtherChapters 的 relatedChapterId 只能使用 comparisonChapters 中实际提供的 chapterId，不得引用目录中的其他章节。",
  "每项判断必须引用输入中真实的 chapterId/page/blockId；禁止编造引用。",
  "低置信度内容不会进入输入，不得自行补回。",
  "不使用外部搜索，不做 External Verification，不生成视频、脚本或 Phase 3B 内容。",
  "严格输出 JSON，不要 Markdown，不要增加字段。",
].join("\n");

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
    if (typeof record.pattern === "string") record.pattern = record.pattern.replaceAll("\\d", "[0-9]");
    Object.values(record).forEach(normalize);
  };
  normalize(result);
  return result;
};

const OLLAMA_FORMAT = toOllamaSchema(InterrogativeDeepReadDraftSchema);

const sampleEvenly = <T>(items: readonly T[], count: number): T[] => {
  if (items.length <= count) return [...items];
  if (count <= 1) return [items[0]!];
  return Array.from({length: count}, (_, index) => (
    items[Math.round(index * (items.length - 1) / (count - 1))]!
  ));
};

const compactInput = (input: InterrogativeDeepReadInput): unknown => {
  const requiredRefs = new Set(input.analysis.claims.flatMap((claim) => (
    claim.bookEvidenceRefs.map((ref) => `${ref.chapterId}:${ref.page}:${ref.blockId}`)
  )));
  const required = input.sourceBlocks.filter((block) => requiredRefs.has(
    `${block.ref.chapterId}:${block.ref.page}:${block.ref.blockId}`,
  ));
  const remaining = input.sourceBlocks.filter((block) => !requiredRefs.has(
    `${block.ref.chapterId}:${block.ref.page}:${block.ref.blockId}`,
  ));
  const selected = [
    ...required,
    ...sampleEvenly(remaining, Math.max(0, MAX_SOURCE_BLOCKS - required.length)),
  ].sort((left, right) => left.ref.page - right.ref.page || left.ref.blockId.localeCompare(right.ref.blockId));
  return {
    chapterId: input.chapterId,
    title: input.title,
    importance: input.importance,
    currentAnalysis: input.analysis,
    sourceBlocks: selected,
    comparisonChapters: input.comparisonChapters,
  };
};

interface OllamaResponse {message?: {content?: string}; error?: string}

const readResponse = async (response: Response): Promise<OllamaResponse> => {
  if (!response.body) return {};
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let error: string | undefined;
  const consume = (line: string): void => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as OllamaResponse;
    content += chunk.message?.content ?? "";
    error ??= chunk.error;
  };
  while (true) {
    const {done, value} = await reader.read();
    pending += decoder.decode(value, {stream: !done});
    let newline = pending.indexOf("\n");
    while (newline !== -1) {
      consume(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
    if (done) break;
  }
  consume(pending);
  return {message: {content}, error};
};

export class OllamaInterrogativeDeepReadProvider implements InterrogativeDeepReadProvider {
  readonly provider = "ollama";
  readonly model: string;
  private readonly request: Fetch;

  constructor({model, fetch: request = fetch}: ProviderOptions) {
    this.model = model;
    this.request = request;
  }

  async analyzeChapter(input: InterrogativeDeepReadInput): Promise<InterrogativeDeepReadDraft> {
    const response = await this.request(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: this.model,
        stream: true,
        think: false,
        format: OLLAMA_FORMAT,
        options: {num_ctx: 16384, num_predict: 6144, temperature: 0},
        messages: [
          {role: "system", content: INSTRUCTIONS},
          {role: "user", content: JSON.stringify(compactInput(input))},
        ],
      }),
    });
    const body = await readResponse(response);
    if (!response.ok) {
      throw new Error(
        `Ollama interrogative deep-read request failed (${response.status}): ${body.error ?? "unknown error"}`,
      );
    }
    const content = body.message?.content;
    if (!content?.trim()) throw new Error("Ollama interrogative deep-read response contained no content");
    return InterrogativeDeepReadDraftSchema.parse(JSON.parse(content));
  }
}

const detectModel = async (request: Fetch): Promise<string> => {
  try {
    const response = await request(OLLAMA_TAGS_URL);
    if (!response.ok) return DEFAULT_MODEL;
    const body = await response.json() as {models?: Array<{name?: string; model?: string}>};
    const names = body.models?.flatMap((item) => [item.name, item.model]
      .filter((name): name is string => typeof name === "string")) ?? [];
    return names.some((name) => name === PREFERRED_MODEL || name.startsWith(`${PREFERRED_MODEL}-`))
      ? PREFERRED_MODEL
      : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
};

export const createOllamaInterrogativeDeepReadProviderFromEnv = async ({
  env = process.env,
  fetch: request = fetch,
}: EnvOptions = {}): Promise<OllamaInterrogativeDeepReadProvider> => new OllamaInterrogativeDeepReadProvider({
  model: env.OLLAMA_INTERROGATIVE_DEEP_READ_MODEL?.trim() || await detectModel(request),
  fetch: request,
});
