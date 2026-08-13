import {z} from "zod";
import {
  IndependentAuditDraftSchema,
  type IndependentAuditDraft,
} from "./independent-audit-schema";
import type {IndependentAuditInput, IndependentAuditProvider} from "./independent-audit-provider";

const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen3:14b";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
interface ProviderOptions {model: string; fetch?: Fetch}
interface EnvOptions {env?: Record<string, string | undefined>; fetch?: Fetch}

const INSTRUCTIONS = [
  "你是 Book Deep Reading Phase 4A Independent Auditor，必须独立审计现有产物，并且只调用一次完成审计。",
  "所有输出使用简体中文；只能使用输入中的 Book Map、Phase 3B、Phase 3C 和 Whole Book Synthesis。",
  "不得使用外部搜索、付费 API、PDF/OCR、视频或脚本，不得补充来源中不存在的新事实。",
  "Coverage：检查全部章节是否合理覆盖，核心论点是否过度依赖少数章节。",
  "Core Thesis：逐项检查 supportingClaimIds 是否真的支持 thesis，thesis 是否扩大 Claim 范围。",
  "Evidence：检查 Claim 与 Evidence 一致性、弱证据强结论、数字统计是否有真实 sourceRef。",
  "本阶段只审计书内证据：缺少外部数据本身不得作为 blocking issue，也不得要求执行外部核验。",
  "定义或作者判断已由原文直接支持且 scope 已明确收窄时，应按其声明范围评估，不得因无法证明普遍适用性而阻断。",
  "只有当前 artifact 内部的 Claim-Evidence 不匹配、无直接依据、范围扩大或因果过度推断，才可列为 blocking issue。",
  "validatedExtractiveClaimIds 已由系统对真实 book block、sourceRef、originalExcerpt、statement、strong support 与 scope 边界做确定性预审。",
  "对 validatedExtractiveClaimIds 中的 extractive author_observation，只能理解为作者在该原文块中明确表达或观察到的内容；不得视为外部验证的客观普遍事实。",
  "不得要求 extractive author_observation 补充原文不存在的因果或普遍性证据，也不得因缺少外部数据证明准确性而设为 blocking。",
  "Scope 与 Causality：阻断把特定时期地区群体泛化、correlation 变 causation、无证据的导致/决定/必然。",
  "Cross-Chapter：检查矛盾是否被忽略、relations 是否有实质意义。",
  "Phase 3C：检查 tensions、limitations、scope corrections 是否进入 synthesis。",
  "Hallucination 与 Translation/OCR：所有 Claim IDs 必须来自输入；低置信度页不得成为核心结论唯一依据。",
  "Video Readiness：判断知识结构能否进入视频选题阶段，但不要在模型输出中给 status 或 videoReady；系统会确定性计算。",
  "blockingIssues、warnings、requiredRepairs 必须指出具体 artifact；涉及 Claim 时必须填写真实 claimIds。",
  "分数必须有差异且与发现一致。严格输出 Schema JSON，不要 Markdown，不要新增字段。",
].join("\n");

const toOllamaSchema = (schema: z.ZodType): Record<string, unknown> => {
  const generated = z.toJSONSchema(schema, {target: "draft-7"});
  const {$schema: _declaration, ...result} = generated;
  const normalize = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(normalize);
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.pattern === "string") record.pattern = record.pattern.replaceAll("\\d", "[0-9]");
    Object.values(record).forEach(normalize);
  };
  normalize(result);
  return result;
};

const OLLAMA_FORMAT = toOllamaSchema(IndependentAuditDraftSchema);

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

export class OllamaIndependentAuditProvider implements IndependentAuditProvider {
  readonly provider = "ollama";
  readonly model: string;
  private readonly request: Fetch;

  constructor({model, fetch: request = fetch}: ProviderOptions) {
    this.model = model;
    this.request = request;
  }

  async audit(input: IndependentAuditInput): Promise<IndependentAuditDraft> {
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
          {role: "user", content: JSON.stringify(input)},
        ],
      }),
    });
    const body = await readResponse(response);
    if (!response.ok) {
      throw new Error(`Ollama independent audit request failed (${response.status}): ${body.error ?? "unknown error"}`);
    }
    const content = body.message?.content;
    if (!content?.trim()) throw new Error("Ollama independent audit response contained no content");
    return IndependentAuditDraftSchema.parse(JSON.parse(content));
  }
}

export const createOllamaIndependentAuditProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: EnvOptions = {}): OllamaIndependentAuditProvider => new OllamaIndependentAuditProvider({
  model: env.OLLAMA_BOOK_AUDIT_MODEL?.trim() || DEFAULT_MODEL,
  fetch: request,
});
