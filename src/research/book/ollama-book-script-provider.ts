import type {BookScriptInput, BookScriptProvider} from "./book-script-provider";
import {BookScriptDraftSchema, type BookScriptDraft} from "./book-script-schema";
import {readOllamaResponse, toOllamaSchema, type OllamaFetch} from "./ollama-structured-json";

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen3:14b";
const FORMAT = toOllamaSchema(BookScriptDraftSchema);
const INSTRUCTIONS = [
  "你是 Book Deep Reading Phase 5 五分钟中文口播稿生成器。只能使用输入，不得外部搜索或补充书外事实。",
  "稿件目标 270-330 秒，默认 300 秒，严格生成 9 段并使用固定时间轴。",
  "0-3秒 Primary Hook；3-8秒 Hook Extension；8-30秒 与观众的关系；30-75秒 作者核心判断；75-145秒 最强证据；145-200秒 第二层机制；200-245秒 反转、限制与 Phase 3C 质疑；245-285秒 我们的判断与现实启示；285-300秒 记忆点结尾。",
  "自然 spoken Chinese，有故事推进；禁止论文腔、AI总结腔和机械的第一点第二点第三点。",
  "作者观点用‘作者/书中’明确归属；系统综合判断用‘我们/这里的判断’明确归属。",
  "数字、案例、关键结论必须绑定真实 claimIds 与 page/block sourceRefs；需要画面标注来源时 visibleSourceRequired=true。",
  "旧数据必须说明是作者研究时期的材料，不得称为 2026 年最新事实。",
  "必须写入输入中的 tensions/limitations/Phase 3C 质疑，不使用未经支持的因果语言，不超出 selected angle。",
  "segment 7 必须从 phase3CCritiques 中选最相关项，逐字使用其 claimId，并至少保留一个该项 sourceRefs；不得编造批评。",
  "若 qualityIssues 含 UNSUPPORTED_CAUSAL_LANGUAGE，必须删除‘导致/造成/决定/必然/因此产生’等无证据因果词，改写为‘相关/伴随/作者认为可能影响/与…有关’。",
  "若 qualityIssues 含 PHASE3C_CRITIQUE_MISSING，必须让 segment 7 同时引用 phase3CCritiques[0] 的 claimId 与真实 sourceRefs。",
  "quality 九项严格按 10/10/15/15/15/10/10/10/5 自评，总分低于80会被系统退回且最多修稿一次。",
  "严格输出 Schema JSON，不要 Markdown，不要新增字段。",
].join("\n");

interface Options {model: string; fetch?: OllamaFetch}
interface EnvOptions {env?: Record<string, string | undefined>; fetch?: OllamaFetch}

export class OllamaBookScriptProvider implements BookScriptProvider {
  readonly provider = "ollama";
  readonly model: string;
  private readonly request: OllamaFetch;
  constructor({model, fetch: request = fetch}: Options) { this.model = model; this.request = request; }

  async generateScript(input: BookScriptInput, qualityIssues?: string[]): Promise<BookScriptDraft> {
    const response = await this.request(OLLAMA_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: this.model,
        stream: true,
        think: false,
        format: FORMAT,
        options: {num_ctx: 32768, num_predict: 8192, temperature: 0.15},
        messages: [
          {role: "system", content: INSTRUCTIONS},
          {role: "user", content: JSON.stringify({input, qualityIssues: qualityIssues ?? []})},
        ],
      }),
    });
    const body = await readOllamaResponse(response);
    if (!response.ok) throw new Error(`Ollama book-script request failed (${response.status}): ${body.error ?? "unknown error"}`);
    if (!body.content.trim()) throw new Error("Ollama book-script response contained no content");
    return BookScriptDraftSchema.parse(JSON.parse(body.content));
  }
}

export const createOllamaBookScriptProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: EnvOptions = {}): OllamaBookScriptProvider => new OllamaBookScriptProvider({
  model: env.OLLAMA_BOOK_SCRIPT_MODEL?.trim() || DEFAULT_MODEL,
  fetch: request,
});
