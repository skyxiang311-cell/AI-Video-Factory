import {z} from "zod";
import type {
  ChapterDeepReadInput,
  ChapterDeepReadProvider,
} from "./chapter-deep-read-provider";
import {ChapterDeepReadOutputError} from "./chapter-deep-read-provider";
export {ChapterDeepReadOutputError} from "./chapter-deep-read-provider";
import {
  ChapterAnalysisSchema,
  ChapterRoleSchema,
  EvidenceSupportSchema,
  EvidenceTypeSchema,
  VerificationStatusSchema,
  type ChapterAnalysis,
} from "./knowledge-schema";

const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen3:14b";
const MAX_CHAPTER_TEXT_CHARACTERS = 10_000;
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
    evidenceSupport: EvidenceSupportSchema,
  })).min(1).max(3),
  arguments: z.array(z.string().min(1).max(180)).max(3).default([]),
  evidence: z.array(z.object({
    evidenceKey: KeySchema,
    type: EvidenceTypeSchema,
    summary: z.string().min(1).max(180),
    supportsClaimKeys: z.array(KeySchema).min(1).max(3),
    strength: ConfidenceSchema,
    blockId: BlockIdSchema,
    interpretation: z.string().min(1).max(180),
    confidence: ConfidenceSchema,
  })).min(1).max(4),
  examples: z.array(z.string().min(1).max(180)).max(3).default([]),
  concepts: z.array(z.string().min(1).max(80)).max(5).default([]),
  questions: z.array(z.string().min(1).max(180)).max(3).default([]),
  limitations: z.array(z.string().min(1).max(180)).max(3).default([]),
  relationsToOtherChapters: z.array(z.string().min(1).max(180)).max(3).default([]),
  quality: z.object({confidence: ConfidenceSchema}).default({confidence: 0.8}),
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

const toOllamaSchema = (schema: z.ZodType): Record<string, unknown> => {
  const generated = z.toJSONSchema(schema, {target: "draft-7"});
  const {$schema: _schemaDeclaration, ...result} = generated;
  const normalizeSchema = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(normalizeSchema);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.pattern === "string") record.pattern = record.pattern.replaceAll("\\d", "[0-9]");
    Object.values(record).forEach(normalizeSchema);
  };
  normalizeSchema(result);
  return result;
};

const OLLAMA_DRAFT_FORMAT = toOllamaSchema(CompactChapterDraftSchema);

const OUTPUT_TEMPLATE = `严格输出以下 JSON 对象，不要 Markdown，不要改字段名：
{
  "chapterRole":"foundation|core_argument|evidence|case_study|method|counterargument|application|summary|supplementary",
  "summary":{"oneSentence":"...","detailed":"..."},
  "claims":[1至3项，每项为{"claimKey":"英文小写slug","type":"...","statement":"...","importance":{"score":0-100,"level":"...","reason":"..."},"authorPosition":"...","scope":{"appliesTo":["具体范围"],"doesNotNecessarilyApplyTo":["具体边界"]},"evidenceBlockIds":["真实blockId"],"confidence":0-1,"verificationStatus":"not_required或needs_external_check","evidenceSupport":"strong|partial|weak|unsupported"}],
  "arguments":["..."],
  "evidence":[1至4项，每项为{"evidenceKey":"英文小写slug","type":"study|statistic|case|anecdote|historical_event|logical_argument|expert_opinion|chart|table|author_observation","summary":"...","supportsClaimKeys":["确实被该原文直接支持的已有claimKey"],"strength":0-1,"blockId":"真实blockId","interpretation":"...","confidence":0-1}],
  "examples":["..."],"concepts":["..."],"questions":["..."],"limitations":["..."],"relationsToOtherChapters":["chapter-id 与关系"],"quality":{"confidence":0-1}
}`;

const INSTRUCTIONS = [
  "你是 Book Deep Reading Phase 3B-1 Claim-first 逐章深读分析器；只分析输入中的当前章节。",
  "所有分析内容统一输出简体中文，原文专有名词可保留。",
  "只能使用 evidenceBlocks 中当前章节的真实原文，不得使用外部知识，不得补充原书没有的事实。",
  "不得把你的判断冒充作者观点：authorPosition 必须区分作者明确主张、作者推断、作者观察与分析者解释。",
  "只提取 1-3 个有知识价值、彼此不同且有直接原文支持的核心 Claim；unsupported Claim 必须删除，不得为了凑数量保留。",
  "每个 Claim.statement 必须是 1-2 个关联 Evidence blocks 的近义转述，保留原文中的主体、时间、范围与不确定性；禁止跨多个片段拼接成更宽泛结论。",
  "每个 Claim 判断 evidenceSupport：strong、partial、weak、unsupported。weak 必须缩小 statement 或 scope；partial 必须在 statement/scope 明确限制；最终不得输出 weak 或 unsupported。",
  "scope.appliesTo 必须只写 Evidence 原文明确覆盖的国家、时期、群体或条件；doesNotNecessarilyApplyTo 必须用‘其他/非/未讨论/不包括’明确边界。原文没有全称范围时禁止写所有、全部、任何、各国、全世界。",
  "生成 1-4 条 Evidence；宁可如实使用一种类型，也不得为了多样性伪造案例、统计或研究。每个核心 Claim 至少关联一条直接支持它的 Evidence。",
  "Evidence.blockId 必须来自 evidenceBlocks；supportsClaimKeys 必须引用本输出的 claimKey。",
  "Evidence.summary 只能忠实概括其单个 blockId 的原文；只有该 originalText 在逻辑上确实支持 Claim 时才能写入 supportsClaimKeys，禁止为满足 Schema 强行绑定。",
  "必须保持原文的否定含义以及因果主体→结果方向；禁止把‘不可以’改成‘可以’，也禁止交换原因和结果。",
  "若原文没有明确因果证据，statement 禁止使用 导致 / 造成 / 决定 / 必然 / 因此产生；必须降级为 相关 / 伴随 / 作者认为可能影响 / 与…有关。",
  "数字、年份、比例必须出现在所关联 Evidence.blockId 的 originalText 中；否则删除该 Claim 或改选真正包含该事实的 blockId。",
  "没有外部核验时，事实性 Claim 使用 needs_external_check；作者定义、明确立场或纯逻辑论证可用 not_required；禁止输出 verified。",
  "relationsToOtherChapters 只能根据 chapterCatalog 指明结构关系，不得添加其他章节事实。",
  "保持高信息密度：总 JSON 不超过 5000 个中文字符；summary.detailed 不超过 300 字，其他说明字段尽量控制在 100 字内。",
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

const normalizeForMatch = (value: string): string => value
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]/gu, "");

const matchFeatures = (value: string): Set<string> => {
  const normalized = normalizeForMatch(value);
  const features = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    features.add(normalized.slice(index, index + 2));
  }
  return features;
};

const matchScore = (query: string, originalText: string): number => {
  const queryNumbers = query.normalize("NFKC").match(/\d+(?:\.\d+)?%?/gu) ?? [];
  const excerptNumbers = new Set(originalText.normalize("NFKC").match(/\d+(?:\.\d+)?%?/gu) ?? []);
  if (queryNumbers.some((number) => !excerptNumbers.has(number))) return -1;
  const queryFeatures = matchFeatures(query);
  if (queryFeatures.size === 0) return 0;
  const excerptFeatures = matchFeatures(originalText);
  let overlap = 0;
  for (const feature of queryFeatures) {
    if (excerptFeatures.has(feature)) overlap += 1;
  }
  return overlap / queryFeatures.size;
};

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
  const claimsByKey = new Map(draft.claims.map((claim) => [claim.claimKey, claim]));
  const bestBlock = (query: string, fallbackBlockId: string) => {
    const fallback = blocks.get(fallbackBlockId);
    if (!fallback) throw new Error(`Unknown chapter evidence block: ${fallbackBlockId}`);
    return input.blocks.reduce((best, candidate) => (
      matchScore(query, candidate.originalText) > matchScore(query, best.originalText)
        ? candidate
        : best
    ), fallback);
  };
  const bookRef = (blockId: string) => {
    const block = blocks.get(blockId);
    if (!block) throw new Error(`Unknown chapter evidence block: ${blockId}`);
    return {type: "book" as const, chapterId: input.chapterId, page: block.page, blockId};
  };
  const mappedEvidence = draft.evidence.map((evidence, index) => {
    const claimText = evidence.supportsClaimKeys
      .map((key) => claimsByKey.get(key)?.statement ?? "")
      .join(" ");
    const declaredBlock = blocks.get(evidence.blockId);
    if (!declaredBlock) throw new Error(`Unknown chapter evidence block: ${evidence.blockId}`);
    const block = matchScore(evidence.summary, declaredBlock.originalText) >= 0.28
      ? declaredBlock
      : bestBlock(
        `${evidence.summary} ${evidence.summary} ${evidence.summary} ${claimText} ${evidence.interpretation}`,
        evidence.blockId,
      );
    return {evidence, index, block};
  });
  const refsForClaim = (claim: typeof draft.claims[number]) => {
    const directBlocks = mappedEvidence
      .filter(({evidence}) => evidence.supportsClaimKeys.includes(claim.claimKey))
      .map(({block}) => block);
    const declaredBlocks = claim.evidenceBlockIds
      .map((blockId) => blocks.get(blockId))
      .filter((block): block is ChapterDeepReadInput["blocks"][number] => (
        block !== undefined && matchScore(claim.statement, block.originalText) >= 0.08
      ));
    const candidates = [...directBlocks, ...declaredBlocks];
    if (candidates.length === 0) candidates.push(bestBlock(claim.statement, claim.evidenceBlockIds[0]!));
    return [...new Map(candidates.map((block) => [block.blockId, block])).values()]
      .map((block) => bookRef(block.blockId));
  };
  return ChapterAnalysisSchema.parse({
    chapterId: input.chapterId,
    title: input.title,
    importance: {score: input.importance, level: "core", reason: input.targetReason},
    chapterRole: draft.chapterRole,
    summary: draft.summary,
    claims: draft.claims.map((claim) => {
      const references = refsForClaim(claim);
      return {
      claimId: claimIds.get(claim.claimKey),
      type: claim.type,
      statement: claim.statement,
      importance: claim.importance,
      authorPosition: claim.authorPosition,
      scope: claim.scope,
      bookEvidenceRefs: references,
      sourceRefs: references,
      confidence: claim.confidence,
      verificationStatus: claim.verificationStatus,
      evidenceSupport: claim.evidenceSupport,
      };
    }),
    arguments: draft.arguments,
    evidence: mappedEvidence.map(({evidence, index, block}) => {
      return {
        evidenceId: `evidence-${chapterSuffix}-${stableKey(evidence.evidenceKey, index)}`,
        type: evidence.type,
        summary: evidence.summary,
        supportsClaimIds: evidence.supportsClaimKeys.map((key) => claimIds.get(key)!),
        strength: evidence.strength,
        sourceRef: bookRef(block.blockId),
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
        format: OLLAMA_DRAFT_FORMAT,
        options: {num_ctx: 16384, num_predict: 2048, temperature: 0},
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
    try {
      return expandDraft(input, JSON.parse(content));
    } catch (error) {
      const issues = error instanceof z.ZodError
        ? error.issues.map((item) => `${item.path.join(".") || "output"}: ${item.message}`)
        : [error instanceof Error ? error.message : String(error)];
      throw new ChapterDeepReadOutputError(issues);
    }
  }
}

export const createOllamaChapterDeepReadProviderFromEnv = ({
  env = process.env,
  fetch: request,
}: EnvOptions = {}): OllamaChapterDeepReadProvider => new OllamaChapterDeepReadProvider({
  model: env.OLLAMA_CHAPTER_ANALYSIS_MODEL?.trim() || DEFAULT_MODEL,
  fetch: request,
});
