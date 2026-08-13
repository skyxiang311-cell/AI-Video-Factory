import type {BookVideoAngleInput, BookVideoAngleProvider} from "./book-video-angle-provider";
import {BookVideoAngleDraftSetSchema, type BookVideoAngleDraftSet} from "./book-video-angle-schema";
import {readOllamaResponse, toOllamaSchema, type OllamaFetch} from "./ollama-structured-json";

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen3:14b";
const FORMAT = toOllamaSchema(BookVideoAngleDraftSetSchema);
const INSTRUCTIONS = [
  "你是 Book Deep Reading Phase 5 Video Angle Engine。全部输出简体中文。",
  "只能使用输入中的 PASS Claims、Evidence、Whole Book Synthesis 与 Phase 3C 质疑，不得使用外部事实或外部搜索。",
  "生成 8-12 个候选角度；每个视频只回答一个 centralQuestion，避免普通的多点读书总结。",
  "每个 centralQuestion 必须是以中文问号结尾的真实问句；候选之间必须实质不同，禁止复制同一问题后只改编号或标题。",
  "每个角度必须引用至少 2 个可靠 Claim、2 个真实 Evidence 与对应 page/block sourceRefs。",
  "每个 coreClaimId 都必须分别直接支持 centralQuestion/thesis；禁止为了凑够两个支撑点塞入只共享主题词但不支持结论的 Claim。",
  "coreClaimIds 必须全部来自同一个 supportBundle。supportBundle 是系统从已通过的 synthesis thesis/pattern/tension/relation 中确定的合法组合。",
  "同一 supportBundle 可以生成不同 angleType 的角度，但 centralQuestion 和叙事价值必须实质不同。",
  "核心 Claim/Evidence ID 必须逐字来自输入，禁止编造 ID；不得依赖 unverified、blocking 或输入外事实。",
  "优先现实冲突、反常识、保存价值、普通人可懂，同时标题不得超过证据范围，不制造爆款假结论。",
  "eligible 只有在证据足够且标题诚信时才可为 true；risks 明确时间、样本、范围和因果限制。",
  "分数 0-100；penalty 越高问题越严重。overallScore 可先估算，系统会确定性重算和排序。",
  "evidenceStrength 必须把输入 Evidence 的 0-1 strength 换算为 0-100；不得直接抄成 0 或 1。",
  "title、centralQuestion、thesis 中的每个主题、数字和因果词都必须能在所链接 Claim/Evidence 文本中找到直接支持。",
  "严格输出 Schema JSON，不要 Markdown，不要新增字段。",
].join("\n");

interface Options {model: string; fetch?: OllamaFetch}
interface EnvOptions {env?: Record<string, string | undefined>; fetch?: OllamaFetch}

export class OllamaBookVideoAngleProvider implements BookVideoAngleProvider {
  readonly provider = "ollama";
  readonly model: string;
  private readonly request: OllamaFetch;
  constructor({model, fetch: request = fetch}: Options) { this.model = model; this.request = request; }

  async generateAngles(input: BookVideoAngleInput, qualityIssues?: string[]): Promise<BookVideoAngleDraftSet> {
    const response = await this.request(OLLAMA_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: this.model,
        stream: true,
        think: false,
        format: FORMAT,
        options: {num_ctx: 32768, num_predict: 8192, temperature: 0.2},
        messages: [{role: "system", content: INSTRUCTIONS}, {role: "user", content: JSON.stringify({input, qualityIssues: qualityIssues ?? []})}],
      }),
    });
    const body = await readOllamaResponse(response);
    if (!response.ok) throw new Error(`Ollama video-angle request failed (${response.status}): ${body.error ?? "unknown error"}`);
    if (!body.content.trim()) throw new Error("Ollama video-angle response contained no content");
    return BookVideoAngleDraftSetSchema.parse(JSON.parse(body.content));
  }
}

export const createOllamaBookVideoAngleProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: EnvOptions = {}): OllamaBookVideoAngleProvider => new OllamaBookVideoAngleProvider({
  model: env.OLLAMA_BOOK_ANGLE_MODEL?.trim() || DEFAULT_MODEL,
  fetch: request,
});
