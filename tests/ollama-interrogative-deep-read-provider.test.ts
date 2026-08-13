import {describe, expect, it} from "vitest";
import type {InterrogativeDeepReadInput} from "../src/research/book/interrogative-deep-read-provider";
import type {InterrogativeDeepReadDraft} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {
  createOllamaInterrogativeDeepReadProviderFromEnv,
} from "../src/research/book/ollama-interrogative-deep-read-provider";

const ref = {type: "book" as const, chapterId: "chapter-001", page: 13, blockId: "p13-b4"};
const analysis = ChapterAnalysisSchema.parse({
  chapterId: "chapter-001",
  title: "第一章 社会分层概述",
  importance: {score: 90, level: "core", reason: "核心章节。"},
  chapterRole: "foundation",
  summary: {oneSentence: "界定社会分层。", detailed: "作者界定社会分层及其范围。"},
  claims: [{
    claimId: "claim-001-definition",
    type: "definition",
    statement: "作者认为该定义只适用于原文界定的社会条件。",
    importance: {score: 90, level: "core", reason: "核心定义。"},
    authorPosition: "作者判断。",
    scope: {appliesTo: ["原文界定条件"], doesNotNecessarilyApplyTo: ["其他条件"]},
    bookEvidenceRefs: [ref], sourceRefs: [ref], confidence: 0.92,
    verificationStatus: "not_required", evidenceSupport: "strong",
  }],
  arguments: [],
  evidence: [{
    evidenceId: "evidence-001-definition", type: "author_observation",
    summary: "作者限定定义范围。", supportsClaimIds: ["claim-001-definition"],
    strength: 0.8, sourceRef: ref,
    originalExcerpt: "作者认为该定义只适用于原文界定的社会条件。",
    interpretation: "作者判断。", confidence: 0.99,
  }],
  concepts: [], examples: [], limitations: [], questions: [], relationsToOtherChapters: [],
  quality: {confidence: 0.9, status: "PASS", blockingIssues: []},
});

const input: InterrogativeDeepReadInput = {
  chapterId: analysis.chapterId,
  title: analysis.title,
  importance: analysis.importance.score,
  analysis,
  sourceBlocks: [{
    ref,
    originalText: "作者认为该定义只适用于原文界定的社会条件。",
    confidence: 0.99,
  }],
  comparisonChapters: [{
    chapterId: analysis.chapterId,
    title: analysis.title,
    importance: 90,
    summary: analysis.summary.oneSentence,
    claims: [{claimId: analysis.claims[0]!.claimId, statement: analysis.claims[0]!.statement, sourceRefs: [ref]}],
  }],
};

const draft: InterrogativeDeepReadDraft = {
  claimAssessments: [{claimId: "claim-001-definition", classification: "author_judgment", sourceRefs: [ref]}],
  revisedClaims: [],
  evidenceLimits: [{
    claimId: "claim-001-definition", proves: "证明作者作出此判断。",
    doesNotProve: "不能证明普遍适用。", sourceRefs: [ref],
  }],
  causalAssessment: [{
    claimId: "claim-001-definition", status: "not_applicable",
    assessment: "没有因果主张。", sourceRefs: [ref],
  }],
  hiddenAssumptions: [], counterpoints: [], contradictions: [], scopeCorrections: [],
  unresolvedQuestions: [{question: "范围能否推广？", sourceRefs: [ref]}],
  relationsToOtherChapters: [],
  finalJudgment: "主张有明确范围。", confidence: 0.9, sourceRefs: [ref],
};

const responseFor = (value: unknown): Response => new Response(JSON.stringify({
  message: {role: "assistant", content: JSON.stringify(value)},
  done: true,
}), {status: 200});

describe("Ollama interrogative deep-read provider", () => {
  it("prefers an installed qwen3:30b and otherwise falls back to qwen3:14b without installation", async () => {
    const with30b = await createOllamaInterrogativeDeepReadProviderFromEnv({
      env: {},
      fetch: async () => new Response(JSON.stringify({models: [{name: "qwen3:14b"}, {name: "qwen3:30b"}]})),
    });
    const fallback = await createOllamaInterrogativeDeepReadProviderFromEnv({
      env: {},
      fetch: async () => new Response(JSON.stringify({models: [{name: "qwen3:14b"}]})),
    });

    expect(with30b.model).toBe("qwen3:30b");
    expect(fallback.model).toBe("qwen3:14b");
  });

  it("makes one structured local chat call for one chapter and forbids external verification", async () => {
    const requests: Array<{url: string; body?: Record<string, any>}> = [];
    const provider = await createOllamaInterrogativeDeepReadProviderFromEnv({
      env: {OLLAMA_INTERROGATIVE_DEEP_READ_MODEL: "qwen3:14b"},
      fetch: async (request, init) => {
        requests.push({
          url: String(request),
          body: init?.body ? JSON.parse(String(init.body)) as Record<string, any> : undefined,
        });
        return responseFor(draft);
      },
    });

    await expect(provider.analyzeChapter(input)).resolves.toEqual(draft);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(requests[0]!.body).toMatchObject({
      model: "qwen3:14b", stream: true, think: false,
      options: {temperature: 0},
    });
    const messages = requests[0]!.body!.messages as Array<{role: string; content: string}>;
    expect(messages[0]!.content).toContain("质疑式二读");
    expect(messages[0]!.content).toContain("不使用外部搜索");
    expect(messages[0]!.content).toContain("不做 External Verification");
    expect(messages[1]!.content).toContain("claim-001-definition");
    expect(requests[0]!.body!.format).toMatchObject({
      type: "object",
      properties: {
        revisedClaims: {maxItems: 3},
        contradictions: {maxItems: 3},
        finalJudgment: {maxLength: 400},
      },
    });
  });
});
