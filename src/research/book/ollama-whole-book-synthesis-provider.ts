import {z} from "zod";
import type {
  WholeBookSynthesisInput,
  WholeBookSynthesisProvider,
} from "./whole-book-synthesis-provider";
import {
  WholeBookArgumentSynthesisSchema,
  type WholeBookArgumentSynthesis,
} from "./whole-book-argument-synthesis-schema";

const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen3:14b";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
interface ProviderOptions {model: string; fetch?: Fetch}
interface EnvOptions {env?: Record<string, string | undefined>; fetch?: Fetch}

const INSTRUCTIONS = [
  "你是 Book Deep Reading Phase 3D Whole Book Synthesis 分析器，只调用一次完成最终综合。",
  "所有输出使用简体中文，原文专有名词可保留。",
  "只能使用输入中的 Book Map 压缩信息、Phase 3B Claims 和 Phase 3C 质疑结果；不得补充其他事实。",
  "不得使用外部搜索，不做 External Verification，不调用 PDF/OCR，不生成视频或脚本。",
  "coreThesis 必须至少一项，每项 supportingClaimIds 必须引用输入中真实 Claim，禁止无 Claim 支持的核心观点。",
  "不要按章节顺序拼接摘要；必须比较不同章节的 Claim，形成跨章节论证结构。",
  "perspective 必须明确区分 author_view、system_synthesis、phase3c_critique。",
  "tensions 和 limitations 必须非空，并优先吸收 deepReads 中 Phase 3C 的 evidenceLimits、causalAssessment、scopeCorrections、counterpoints、contradictions 与 finalJudgment。",
  "relations 只能连接真实 Claim，relation 只能使用 supports、contradicts、extends、explains、example_of、depends_on、qualifies、repeats。",
  "relations 至少包含 3 种不同 relation 类型，不得使用其他关系名称。",
  "crossChapterPatterns 必须真正跨至少两个章节，不能是单章摘要改写。",
  "严格输出 Schema JSON，不要 Markdown，不要新增字段。",
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

const OLLAMA_FORMAT = toOllamaSchema(WholeBookArgumentSynthesisSchema);

const clipped = (value: string, maximum: number): string => (
  value.length <= maximum ? value : value.slice(0, maximum)
);

const compactInput = (input: WholeBookSynthesisInput): unknown => ({
  map: {
    coreProblem: clipped(input.map.coreProblem, 600),
    candidateCoreTheses: input.map.candidateCoreTheses.slice(0, 5).map((item) => clipped(item, 400)),
    structureOverview: clipped(input.map.structureOverview, 600),
    recurringConcepts: input.map.recurringConcepts.slice(0, 12).map((item) => clipped(item, 100)),
  },
  chapters: input.chapters.map((chapter) => ({
    ...chapter,
    title: clipped(chapter.title, 160),
    summary: clipped(chapter.summary, 300),
    role: clipped(chapter.role, 240),
  })),
  claims: input.claims.map((claim) => ({
    ...claim,
    statement: clipped(claim.statement, 500),
    authorPosition: clipped(claim.authorPosition, 240),
    scope: {
      appliesTo: claim.scope.appliesTo.slice(0, 3).map((item) => clipped(item, 160)),
      doesNotNecessarilyApplyTo: claim.scope.doesNotNecessarilyApplyTo
        .slice(0, 3).map((item) => clipped(item, 160)),
    },
    evidenceSummaries: claim.evidenceSummaries.slice(0, 4).map((item) => clipped(item, 280)),
    limitations: claim.limitations.slice(0, 4).map((item) => clipped(item, 240)),
    sourceRefs: claim.sourceRefs.slice(0, 8),
  })),
  deepReads: input.deepReads.map((deepRead) => ({
    chapterId: deepRead.chapterId,
    originalClaims: deepRead.originalClaims,
    revisedClaims: deepRead.revisedClaims,
    evidenceLimits: deepRead.evidenceLimits,
    causalAssessment: deepRead.causalAssessment,
    hiddenAssumptions: deepRead.hiddenAssumptions,
    counterpoints: deepRead.counterpoints,
    contradictions: deepRead.contradictions,
    scopeCorrections: deepRead.scopeCorrections,
    unresolvedQuestions: deepRead.unresolvedQuestions,
    relationsToOtherChapters: deepRead.relationsToOtherChapters,
    finalJudgment: deepRead.finalJudgment,
    confidence: deepRead.confidence,
  })),
});

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

export class OllamaWholeBookSynthesisProvider implements WholeBookSynthesisProvider {
  readonly provider = "ollama";
  readonly model: string;
  private readonly request: Fetch;

  constructor({model, fetch: request = fetch}: ProviderOptions) {
    this.model = model;
    this.request = request;
  }

  async synthesize(input: WholeBookSynthesisInput): Promise<WholeBookArgumentSynthesis> {
    const response = await this.request(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: this.model,
        stream: true,
        think: false,
        format: OLLAMA_FORMAT,
        options: {num_ctx: 32768, num_predict: 6144, temperature: 0},
        messages: [
          {role: "system", content: INSTRUCTIONS},
          {role: "user", content: JSON.stringify(compactInput(input))},
        ],
      }),
    });
    const body = await readResponse(response);
    if (!response.ok) {
      throw new Error(
        `Ollama whole-book synthesis request failed (${response.status}): ${body.error ?? "unknown error"}`,
      );
    }
    const content = body.message?.content;
    if (!content?.trim()) throw new Error("Ollama whole-book synthesis response contained no content");
    return WholeBookArgumentSynthesisSchema.parse(JSON.parse(content));
  }
}

export const createOllamaWholeBookSynthesisProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: EnvOptions = {}): OllamaWholeBookSynthesisProvider => new OllamaWholeBookSynthesisProvider({
  model: env.OLLAMA_BOOK_SYNTHESIS_MODEL?.trim() || DEFAULT_MODEL,
  fetch: request,
});
