import {z} from "zod";
import type {
  ChapterDeepReadInput,
  ChapterDeepReadProvider,
} from "./chapter-deep-read-provider";
import {
  ChapterAnalysisSchema,
  ChapterRoleSchema,
  EvidenceTypeSchema,
  VerificationStatusSchema,
  type ChapterAnalysis,
} from "./knowledge-schema";

const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen3:14b";
const MAX_CHAPTER_TEXT_CHARACTERS = 18_000;
const KeySchema = z.string().trim().min(1).max(80);
const BlockIdSchema = z.string().regex(/^p\d+-[a-z0-9-]+$/);
const ConfidenceSchema = z.number().min(0).max(1);
const ImportanceSchema = z.object({
  score: z.number().min(0).max(100),
  level: z.string().min(1).max(20),
  reason: z.string().min(1).max(160),
});

const CompactChapterDraftSchema = z.object({
  chapterRole: ChapterRoleSchema,
  summary: z.object({
    oneSentence: z.string().min(1).max(180),
    detailed: z.string().min(1).max(600),
  }),
  claims: z.array(z.object({
    claimKey: KeySchema,
    type: z.string().min(1).max(40),
    statement: z.string().min(1).max(240),
    importance: ImportanceSchema,
    authorPosition: z.string().min(1).max(200),
    scope: z.object({
      appliesTo: z.array(z.string().min(1).max(120)).min(1).max(3),
      doesNotNecessarilyApplyTo: z.array(z.string().min(1).max(120)).min(1).max(3),
    }),
    evidenceBlockIds: z.array(BlockIdSchema).min(1),
    confidence: ConfidenceSchema,
    verificationStatus: VerificationStatusSchema.extract([
      "not_required", "needs_external_check",
    ]),
  })).length(3),
  arguments: z.array(z.string().min(1).max(180)).max(3),
  evidence: z.array(z.object({
    evidenceKey: KeySchema,
    type: EvidenceTypeSchema,
    summary: z.string().min(1).max(180),
    supportsClaimKeys: z.array(KeySchema).min(1).max(3),
    strength: ConfidenceSchema,
    blockId: BlockIdSchema,
    interpretation: z.string().min(1).max(180),
    confidence: ConfidenceSchema,
  })).min(3).max(4),
  examples: z.array(z.string().min(1).max(180)).max(3),
  concepts: z.array(z.string().min(1).max(80)).max(5),
  questions: z.array(z.string().min(1).max(180)).max(3),
  limitations: z.array(z.string().min(1).max(180)).min(1).max(3),
  relationsToOtherChapters: z.array(z.string().min(1).max(180)).max(3),
  quality: z.object({confidence: ConfidenceSchema}),
}).superRefine((draft, context) => {
  const claimKeys = new Set<string>();
  draft.claims.forEach((claim, index) => {
    if (claimKeys.has(claim.claimKey)) {
      context.addIssue({
        code: "custom",
        path: ["claims", index, "claimKey"],
        message: "Claim keys must be unique",
      });
    }
    claimKeys.add(claim.claimKey);
  });
  const evidenceKeys = new Set<string>();
  draft.evidence.forEach((evidence, index) => {
    if (evidenceKeys.has(evidence.evidenceKey)) {
      context.addIssue({
        code: "custom",
        path: ["evidence", index, "evidenceKey"],
        message: "Evidence keys must be unique",
      });
    }
    evidenceKeys.add(evidence.evidenceKey);
    for (const claimKey of evidence.supportsClaimKeys) {
      if (!claimKeys.has(claimKey)) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "supportsClaimKeys"],
          message: `Unknown claim key: ${claimKey}`,
        });
      }
    }
  });
});

const OUTPUT_TEMPLATE = `严格输出以下 JSON 对象，不要 Markdown，不要改字段名：
{
  "chapterRole":"foundation|core_argument|evidence|case_study|method|counterargument|application|summary|supplementary",
  "summary":{"oneSentence":"...","detailed":"..."},
  "claims":[恰好3项，每项为{"claimKey":"英文小写slug","type":"...","statement":"...","importance":{"score":0-100,"level":"...","reason":"..."},"authorPosition":"...","scope":{"appliesTo":["具体范围"],"doesNotNecessarilyApplyTo":["具体边界"]},"evidenceBlockIds":["真实blockId"],"confidence":0-1,"verificationStatus":"not_required或needs_external_check"}],
  "arguments":["..."],
  "evidence":[3至4项，每项为{"evidenceKey":"英文小写slug","type":"study|statistic|case|anecdote|historical_event|logical_argument|expert_opinion|chart|table|author_observation","summary":"...","supportsClaimKeys":["已有claimKey"],"strength":0-1,"blockId":"真实blockId","interpretation":"...","confidence":0-1}],
  "examples":["..."],"concepts":["..."],"questions":["..."],"limitations":["..."],"relationsToOtherChapters":["chapter-id 与关系"],"quality":{"confidence":0-1}
}`;

const INSTRUCTIONS = [
  "你是 Book Deep Reading Phase 3B-1 Claim-first 逐章深读分析器；只分析输入中的当前章节。",
  "所有分析内容统一输出简体中文，原文专有名词可保留。",
  "只能使用 evidenceBlocks 中当前章节的真实原文，不得使用外部知识，不得补充原书没有的事实。",
  "不得把你的判断冒充作者观点：authorPosition 必须区分作者明确主张、作者推断、作者观察与分析者解释。",
  "提取恰好 3 个有知识价值且彼此不同的核心 Claim；每个 Claim 用 evidenceBlockIds 引用真实 blockId，并保存具体适用范围与边界。",
  "生成 3-4 条 Evidence；宁可如实使用一种类型，也不得为了多样性伪造案例、统计或研究。",
  "Evidence.blockId 必须来自 evidenceBlocks；supportsClaimKeys 必须引用本输出的 claimKey。",
  "没有外部核验时，事实性 Claim 使用 needs_external_check；作者定义、明确立场或纯逻辑论证可用 not_required；禁止输出 verified。",
  "relationsToOtherChapters 只能根据 chapterCatalog 指明结构关系，不得添加其他章节事实。",
  "保持高信息密度：总 JSON 不超过 8000 个中文字符；summary.detailed 不超过 400 字，其他说明字段尽量控制在 120 字内。",
  "不要执行外部核验，不要开始 Phase 3C，不要生成视频选题、脚本或 Storyboard。",
  OUTPUT_TEMPLATE,
].join("\n");

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
interface ProviderOptions {model: string; fetch?: Fetch}
interface EnvOptions {env?: Record<string, string | undefined>; fetch?: Fetch}
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

const sampleEvenly = <T>(items: readonly T[], count: number): T[] => {
  if (items.length <= count) return [...items];
  if (count <= 1) return [items[0]!];
  return Array.from({length: count}, (_, index) => (
    items[Math.round(index * (items.length - 1) / (count - 1))]!
  ));
};

const selectEvidenceBlocks = (
  blocks: ChapterDeepReadInput["blocks"],
): ChapterDeepReadInput["blocks"] => {
  const totalCharacters = blocks.reduce((sum, block) => sum + block.originalText.length, 0);
  if (totalCharacters <= MAX_CHAPTER_TEXT_CHARACTERS) return blocks;
  const indexed = blocks.map((block, index) => ({block, index}));
  const headings = indexed.filter(({block}) => block.type === "heading");
  const body = indexed.filter(({block}) => block.type !== "heading");
  const headingCharacters = headings.reduce((sum, item) => sum + item.block.originalText.length, 0);
  const bodyBudget = Math.max(1, MAX_CHAPTER_TEXT_CHARACTERS - headingCharacters);
  const bodyCharacters = body.reduce((sum, item) => sum + item.block.originalText.length, 0);
  let bodyCount = Math.max(2, Math.floor(body.length * bodyBudget / bodyCharacters));
  let sampledBody = sampleEvenly(body, Math.min(bodyCount, body.length));
  while (
    bodyCount > 2
    && sampledBody.reduce((sum, item) => sum + item.block.originalText.length, 0) > bodyBudget
  ) {
    bodyCount -= 1;
    sampledBody = sampleEvenly(body, bodyCount);
  }
  return [...headings, ...sampledBody]
    .sort((left, right) => left.index - right.index)
    .map(({block}) => block);
};

const compactInput = (input: ChapterDeepReadInput): unknown => ({
  chapter: {
    chapterId: input.chapterId,
    title: input.title,
    chapterRole: input.chapterRole,
    chapterSummary: input.chapterSummary,
    importance: input.importance,
    targetPriority: input.targetPriority,
    targetReason: input.targetReason,
  },
  chapterCatalog: input.chapterCatalog,
  evidenceBlockFields: ["blockId", "page", "type", "originalText", "confidence"],
  evidenceBlocks: selectEvidenceBlocks(input.blocks).map((block) => [
    block.blockId, block.page, block.type, block.originalText, block.confidence,
  ]),
});

const expandDraft = (input: ChapterDeepReadInput, rawDraft: unknown): ChapterAnalysis => {
  const draft = CompactChapterDraftSchema.parse(rawDraft);
  const blocks = new Map(input.blocks.map((block) => [block.blockId, block]));
  const chapterSuffix = input.chapterId.replace(/^chapter-/, "");
  const stableKey = (key: string, index: number): string => (
    /^[a-z0-9-]+$/.test(key) ? key : String(index + 1).padStart(3, "0")
  );
  const claimIds = new Map(draft.claims.map((claim, index) => [
    claim.claimKey,
    `claim-${chapterSuffix}-${stableKey(claim.claimKey, index)}`,
  ]));
  const bookRef = (blockId: string) => {
    const block = blocks.get(blockId);
    if (!block) throw new Error(`Unknown chapter evidence block: ${blockId}`);
    return {type: "book" as const, chapterId: input.chapterId, page: block.page, blockId};
  };
  return ChapterAnalysisSchema.parse({
    chapterId: input.chapterId,
    title: input.title,
    importance: {score: input.importance, level: "core", reason: input.targetReason},
    chapterRole: draft.chapterRole,
    summary: draft.summary,
    claims: draft.claims.map((claim) => ({
      claimId: claimIds.get(claim.claimKey),
      type: claim.type,
      statement: claim.statement,
      importance: claim.importance,
      authorPosition: claim.authorPosition,
      scope: claim.scope,
      bookEvidenceRefs: claim.evidenceBlockIds.map(bookRef),
      sourceRefs: claim.evidenceBlockIds.map(bookRef),
      confidence: claim.confidence,
      verificationStatus: claim.verificationStatus,
    })),
    arguments: draft.arguments,
    evidence: draft.evidence.map((evidence, index) => {
      const block = blocks.get(evidence.blockId);
      if (!block) throw new Error(`Unknown chapter evidence block: ${evidence.blockId}`);
      return {
        evidenceId: `evidence-${chapterSuffix}-${stableKey(evidence.evidenceKey, index)}`,
        type: evidence.type,
        summary: evidence.summary,
        supportsClaimIds: evidence.supportsClaimKeys.map((key) => claimIds.get(key)!),
        strength: evidence.strength,
        sourceRef: bookRef(evidence.blockId),
        originalExcerpt: block.originalText,
        interpretation: evidence.interpretation,
        confidence: evidence.confidence,
      };
    }),
    examples: draft.examples,
    concepts: draft.concepts,
    questions: draft.questions,
    limitations: draft.limitations,
    relationsToOtherChapters: draft.relationsToOtherChapters,
    quality: draft.quality,
  });
};

export class OllamaChapterDeepReadProvider implements ChapterDeepReadProvider {
  readonly provider = "ollama";
  readonly model: string;
  private readonly request: Fetch;

  constructor({model, fetch: request = fetch}: ProviderOptions) {
    this.model = model;
    this.request = request;
  }

  async analyzeChapter(
    input: ChapterDeepReadInput,
    qualityFeedback?: string[],
  ): Promise<ChapterAnalysis> {
    const correction = qualityFeedback?.length
      ? `\n必须修正上一次问题：\n- ${qualityFeedback.join("\n- ")}`
      : "";
    const response = await this.request(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: this.model,
        stream: true,
        think: false,
        format: "json",
        options: {num_ctx: 32768, num_predict: 3072, temperature: 0},
        messages: [
          {role: "system", content: INSTRUCTIONS + correction},
          {role: "user", content: JSON.stringify(compactInput(input))},
        ],
      }),
    });
    const body = await readResponse(response);
    if (!response.ok) {
      throw new Error(
        `Ollama chapter deep-read request failed (${response.status}): ${body.error ?? "unknown error"}`,
      );
    }
    const content = body.message?.content;
    if (!content?.trim()) throw new Error("Ollama chapter deep-read response contained no content");
    return expandDraft(input, JSON.parse(content));
  }
}

export const createOllamaChapterDeepReadProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: EnvOptions = {}): OllamaChapterDeepReadProvider => new OllamaChapterDeepReadProvider({
  model: env.OLLAMA_CHAPTER_ANALYSIS_MODEL?.trim() || DEFAULT_MODEL,
  fetch: request,
});
