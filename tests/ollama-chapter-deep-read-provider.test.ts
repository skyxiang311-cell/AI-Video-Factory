import {describe, expect, it} from "vitest";
import type {ChapterDeepReadInput} from "../src/research/book/chapter-deep-read-provider";
import {
  createOllamaChapterDeepReadProviderFromEnv,
} from "../src/research/book/ollama-chapter-deep-read-provider";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";

const input: ChapterDeepReadInput = {
  chapterId: "chapter-001",
  title: "第一章 独有主题",
  chapterRole: "建立全书概念基础。",
  chapterSummary: "解释本章独有机制。",
  importance: 91,
  targetPriority: 1,
  targetReason: "需要进一步深读其论证边界。",
  chapterCatalog: [
    {chapterId: "chapter-001", title: "第一章 独有主题"},
    {chapterId: "chapter-024", title: "第二十四章 研究综述"},
  ],
  blocks: [{
    blockId: "p13-b4",
    page: 13,
    chapterId: "chapter-001",
    type: "paragraph",
    originalText: "作者认为，该机制只适用于明确界定的社会条件。",
    language: "zh-CN",
    confidence: 0.99,
  }],
};

const analysis = ChapterAnalysisSchema.parse({
  chapterId: input.chapterId,
  title: input.title,
  importance: {score: 91, level: "core", reason: input.targetReason},
  chapterRole: "foundation",
  summary: {oneSentence: "该机制受社会条件限制。", detailed: "作者界定机制及其边界。"},
  claims: [{
    claimId: "claim-001-conditioned-mechanism",
    type: "mechanism",
    statement: "作者主张该机制只适用于明确界定的社会条件。",
    importance: {score: 90, level: "core", reason: "构成本章核心观点。"},
    authorPosition: "这是作者明确表达的观点，不是分析模型的事实判断。",
    scope: {appliesTo: ["作者界定的社会条件"], doesNotNecessarilyApplyTo: ["条件不明的其他社会"]},
    bookEvidenceRefs: [{type: "book", chapterId: "chapter-001", page: 13, blockId: "p13-b4"}],
    sourceRefs: [{type: "book", chapterId: "chapter-001", page: 13, blockId: "p13-b4"}],
    confidence: 0.92,
    verificationStatus: "not_required",
  }],
  arguments: ["先限定条件，再提出机制。"],
  evidence: [{
    evidenceId: "evidence-001-logical",
    type: "logical_argument",
    summary: "条件限定支持该机制。",
    supportsClaimIds: ["claim-001-conditioned-mechanism"],
    strength: 0.7,
    sourceRef: {type: "book", chapterId: "chapter-001", page: 13, blockId: "p13-b4"},
    originalExcerpt: input.blocks[0]!.originalText,
    interpretation: "这是书内逻辑论证。",
    confidence: 0.99,
  }, {
    evidenceId: "evidence-001-observation",
    type: "author_observation",
    summary: "作者观察说明适用情境。",
    supportsClaimIds: ["claim-001-conditioned-mechanism"],
    strength: 0.5,
    sourceRef: {type: "book", chapterId: "chapter-001", page: 13, blockId: "p13-b4"},
    originalExcerpt: input.blocks[0]!.originalText,
    interpretation: "作者观察不等于外部验证。",
    confidence: 0.99,
  }],
  concepts: ["条件机制"],
  examples: [],
  limitations: ["不能推广到条件不明的其他社会。"],
  questions: ["边界能否被经验检验？"],
  relationsToOtherChapters: ["chapter-024 提供研究综述。"],
  quality: {confidence: 0.9},
});
analysis.claims.push(
  {...structuredClone(analysis.claims[0]!), claimId: "claim-001-conditioned-scope", statement: "作者进一步限定该机制的适用对象。"},
  {...structuredClone(analysis.claims[0]!), claimId: "claim-001-conditioned-boundary", statement: "作者指出该机制不能无条件推广。"},
);
analysis.evidence.push(
  {...structuredClone(analysis.evidence[0]!), evidenceId: "evidence-001-case", type: "case"},
  {...structuredClone(analysis.evidence[0]!), evidenceId: "evidence-001-expert", type: "expert_opinion"},
);

const compactDraft = {
  chapterRole: "foundation",
  summary: {oneSentence: "该机制受社会条件限制。", detailed: "作者界定机制及其边界。"},
  claims: analysis.claims.map((claim, index) => ({
    claimKey: ["conditioned-mechanism", "conditioned-scope", "conditioned-boundary"][index],
    type: claim.type,
    statement: claim.statement,
    importance: claim.importance,
    authorPosition: claim.authorPosition,
    scope: claim.scope,
    evidenceBlockIds: ["p13-b4"],
    confidence: claim.confidence,
    verificationStatus: claim.verificationStatus,
  })),
  arguments: analysis.arguments,
  evidence: analysis.evidence.map((evidence, index) => ({
    evidenceKey: ["logical", "observation", "case", "expert"][index],
    type: evidence.type,
    summary: evidence.summary,
    supportsClaimKeys: ["conditioned-mechanism"],
    strength: evidence.strength,
    blockId: "p13-b4",
    interpretation: evidence.interpretation,
    confidence: evidence.confidence,
  })),
  concepts: analysis.concepts,
  examples: analysis.examples,
  limitations: analysis.limitations,
  questions: analysis.questions,
  relationsToOtherChapters: analysis.relationsToOtherChapters,
  quality: analysis.quality,
};

const responseFor = (value: unknown): Response => new Response(JSON.stringify({
  model: "qwen3:14b",
  message: {role: "assistant", content: JSON.stringify(value)},
  done: true,
}), {status: 200});

const draftForBlock = (blockId: string) => ({
  ...structuredClone(compactDraft),
  claims: compactDraft.claims.map((claim) => ({...structuredClone(claim), evidenceBlockIds: [blockId]})),
  evidence: compactDraft.evidence.map((evidence) => ({...structuredClone(evidence), blockId})),
});

describe("Ollama claim-first chapter provider", () => {
  it("defaults to qwen3:14b and allows a local model override", () => {
    expect(createOllamaChapterDeepReadProviderFromEnv({env: {}}).model).toBe("qwen3:14b");
    expect(createOllamaChapterDeepReadProviderFromEnv({
      env: {OLLAMA_CHAPTER_ANALYSIS_MODEL: "qwen3:32b"},
    }).model).toBe("qwen3:32b");
  });

  it("sends only one chapter to local Ollama with book-only structured JSON", async () => {
    let url = "";
    let requestBody: Record<string, unknown> = {};
    const provider = createOllamaChapterDeepReadProviderFromEnv({
      env: {},
      fetch: async (request, init) => {
        url = String(request);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return responseFor(compactDraft);
      },
    });

    await expect(provider.analyzeChapter(input)).resolves.toEqual(analysis);
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(requestBody).toMatchObject({model: "qwen3:14b", stream: true, think: false});
    const messages = requestBody.messages as Array<{role: string; content: string}>;
    const sent = JSON.parse(messages[1]!.content) as {
      chapter: {chapterId: string};
      evidenceBlockFields: string[];
      evidenceBlocks: Array<[string, number, string, string, number]>;
    };
    expect(sent.chapter.chapterId).toBe(input.chapterId);
    expect(sent.evidenceBlockFields).toEqual([
      "blockId", "page", "type", "originalText", "confidence",
    ]);
    expect(sent.evidenceBlocks).toEqual([[
      "p13-b4", 13, "paragraph", input.blocks[0]!.originalText, 0.99,
    ]]);
    expect(messages[0]!.content).toContain("只分析输入中的当前章节");
    expect(messages[0]!.content).toContain("不得把你的判断冒充作者观点");
    expect(messages[0]!.content).toContain("不要执行外部核验");
    expect(requestBody.format).toBe("json");
    expect(requestBody.options).toMatchObject({num_ctx: 32768, num_predict: 3072});
    expect(messages[0]!.content).toContain("恰好 3 个");
    expect(messages[0]!.content).toContain("3-4 条 Evidence");
    expect(messages[0]!.content).toContain("总 JSON 不超过 8000 个中文字符");
  });

  it("keeps broad page coverage while limiting oversized real chapter text", async () => {
    const oversized: ChapterDeepReadInput = {
      ...input,
      blocks: Array.from({length: 500}, (_, index) => ({
        ...input.blocks[0]!,
        blockId: `p${index + 1}-b1`,
        page: index + 1,
        originalText: `${String(index + 1).padStart(4, "0")}${"真实章节文字".repeat(12)}`,
      })),
    };
    let sentBlocks: Array<[string, number, string, string, number]> = [];
    const provider = createOllamaChapterDeepReadProviderFromEnv({
      env: {},
      fetch: async (_request, init) => {
        const body = JSON.parse(String(init?.body)) as {
          messages: Array<{content: string}>;
        };
        sentBlocks = (JSON.parse(body.messages[1]!.content) as {
          evidenceBlocks: Array<[string, number, string, string, number]>;
        }).evidenceBlocks;
        return responseFor(draftForBlock(sentBlocks[0]![0]));
      },
    });

    await provider.analyzeChapter(oversized);

    expect(sentBlocks.reduce((sum, block) => sum + block[3].length, 0)).toBeLessThanOrEqual(18_000);
    expect(sentBlocks[0]?.[0]).toBe("p1-b1");
    expect(sentBlocks.at(-1)?.[0]).toBe("p500-b1");
    expect(new Set(sentBlocks.map((block) => block[1])).size).toBe(sentBlocks.length);
  });

  it("assembles streamed output and rejects malformed analysis", async () => {
    const serialized = JSON.stringify(compactDraft);
    const split = Math.floor(serialized.length / 2);
    const provider = createOllamaChapterDeepReadProviderFromEnv({
      env: {},
      fetch: async () => new Response([
        JSON.stringify({message: {content: serialized.slice(0, split)}, done: false}),
        JSON.stringify({message: {content: serialized.slice(split)}, done: true}),
      ].join("\n"), {status: 200}),
    });
    await expect(provider.analyzeChapter(input)).resolves.toEqual(analysis);

    const invalid = createOllamaChapterDeepReadProviderFromEnv({
      env: {},
      fetch: async () => responseFor({chapterId: "chapter-001"}),
    });
    await expect(invalid.analyzeChapter(input)).rejects.toThrow();
  });

  it("maps non-Latin model-local keys to stable final claim and evidence ids", async () => {
    const localized = structuredClone(compactDraft);
    localized.claims.forEach((claim, index) => {
      claim.claimKey = `主张${index + 1}`;
    });
    localized.evidence.forEach((evidence, index) => {
      evidence.evidenceKey = `证据${index + 1}`;
      evidence.supportsClaimKeys = ["主张1"];
    });
    const provider = createOllamaChapterDeepReadProviderFromEnv({
      env: {},
      fetch: async () => responseFor(localized),
    });

    const result = await provider.analyzeChapter(input);

    expect(result.claims.map((claim) => claim.claimId)).toEqual([
      "claim-001-001", "claim-001-002", "claim-001-003",
    ]);
    expect(result.evidence.map((evidence) => evidence.evidenceId)).toEqual([
      "evidence-001-001", "evidence-001-002", "evidence-001-003", "evidence-001-004",
    ]);
    expect(result.evidence.every((evidence) => (
      evidence.supportsClaimIds[0] === "claim-001-001"
    ))).toBe(true);
  });

  it("preserves every real block reference when a Claim needs more than three", async () => {
    const expandedInput = {
      ...input,
      blocks: Array.from({length: 4}, (_, index) => ({
        ...input.blocks[0]!,
        blockId: `p13-b${index + 1}`,
      })),
    };
    const expandedDraft = draftForBlock("p13-b1");
    expandedDraft.claims[0]!.evidenceBlockIds = ["p13-b1", "p13-b2", "p13-b3", "p13-b4"];
    const provider = createOllamaChapterDeepReadProviderFromEnv({
      env: {},
      fetch: async () => responseFor(expandedDraft),
    });

    const result = await provider.analyzeChapter(expandedInput);

    expect(result.claims[0]!.bookEvidenceRefs.map((reference) => reference.blockId)).toEqual([
      "p13-b1", "p13-b2", "p13-b3", "p13-b4",
    ]);
  });
});
