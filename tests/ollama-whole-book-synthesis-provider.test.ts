import {describe, expect, it} from "vitest";
import type {WholeBookArgumentSynthesis} from "../src/research/book/whole-book-argument-synthesis-schema";
import type {WholeBookSynthesisInput} from "../src/research/book/whole-book-synthesis-provider";
import {
  createOllamaWholeBookSynthesisProviderFromEnv,
} from "../src/research/book/ollama-whole-book-synthesis-provider";

const refs = [
  {type: "book" as const, chapterId: "chapter-a", page: 1, blockId: "p1-b1"},
  {type: "book" as const, chapterId: "chapter-b", page: 2, blockId: "p2-b1"},
];
const input: WholeBookSynthesisInput = {
  map: {
    coreProblem: "本书解释行动学习如何形成闭环。",
    candidateCoreTheses: ["短周期反馈可能改善学习。"],
    structureOverview: "先定义方法，再限定证据。",
    recurringConcepts: ["反馈闭环"],
  },
  chapters: [
    {chapterId: "chapter-a", title: "甲章", importance: 90, summary: "定义方法。", role: "基础"},
    {chapterId: "chapter-b", title: "乙章", importance: 85, summary: "限定证据。", role: "限定"},
  ],
  claims: [
    {
      claimId: "claim-a", chapterId: "chapter-a", statement: "作者定义短周期复盘。",
      authorPosition: "作者判断。", scope: {appliesTo: ["行动学习"], doesNotNecessarilyApplyTo: ["其他情境"]},
      importance: 90, evidenceSummaries: ["作者定义短周期复盘。"], limitations: [], sourceRefs: [refs[0]!],
    },
    {
      claimId: "claim-b", chapterId: "chapter-b", statement: "反馈证据只覆盖合成样本。",
      authorPosition: "作者判断。", scope: {appliesTo: ["合成样本"], doesNotNecessarilyApplyTo: ["真实人群"]},
      importance: 85, evidenceSummaries: ["样本是合成数据。"], limitations: ["不能外推。"], sourceRefs: [refs[1]!],
    },
  ],
  deepReads: [],
};

const output: WholeBookArgumentSynthesis = {
  coreThesis: [{statement: "短周期复盘构成核心方法。", confidence: 0.9, supportingClaimIds: ["claim-a"], perspective: "system_synthesis"}],
  secondaryTheses: [{statement: "反馈证据范围有限。", confidence: 0.8, supportingClaimIds: ["claim-b"], perspective: "system_synthesis"}],
  argumentMap: [{statement: "定义与限制构成论证结构。", perspective: "author_view", supportingClaimIds: ["claim-a", "claim-b"]}],
  keyConcepts: [{concept: "反馈闭环", explanation: "改动接受反馈。", supportingClaimIds: ["claim-a"]}],
  crossChapterPatterns: [{statement: "方法与边界跨章衔接。", chapterIds: ["chapter-a", "chapter-b"], supportingClaimIds: ["claim-a", "claim-b"]}],
  tensions: [{statement: "方法价值与证据外推限制存在张力。", perspective: "phase3c_critique", supportingClaimIds: ["claim-b"]}],
  limitations: [{statement: "证据不能外推。", perspective: "phase3c_critique", supportingClaimIds: ["claim-b"]}],
  practicalFrameworks: [{name: "行动反馈", steps: ["行动", "反馈"], supportingClaimIds: ["claim-a"]}],
  readerTakeaways: [{statement: "保留证据边界。", supportingClaimIds: ["claim-b"]}],
  relations: [
    {fromClaimId: "claim-a", toClaimId: "claim-b", relation: "supports"},
    {fromClaimId: "claim-b", toClaimId: "claim-a", relation: "qualifies"},
    {fromClaimId: "claim-a", toClaimId: "claim-b", relation: "explains"},
  ],
};

const responseFor = (value: unknown): Response => new Response(JSON.stringify({
  message: {role: "assistant", content: JSON.stringify(value)}, done: true,
}), {status: 200});

describe("Ollama whole-book synthesis provider", () => {
  it("defaults to local qwen3:14b and allows a model override", () => {
    expect(createOllamaWholeBookSynthesisProviderFromEnv({env: {}}).model).toBe("qwen3:14b");
    expect(createOllamaWholeBookSynthesisProviderFromEnv({
      env: {OLLAMA_BOOK_SYNTHESIS_MODEL: "qwen3:30b"},
    }).model).toBe("qwen3:30b");
  });

  it("makes exactly one structured local synthesis call with compressed existing artifacts", async () => {
    const requests: Array<{url: string; body: Record<string, any>}> = [];
    const provider = createOllamaWholeBookSynthesisProviderFromEnv({
      env: {},
      fetch: async (request, init) => {
        requests.push({url: String(request), body: JSON.parse(String(init?.body))});
        return responseFor(output);
      },
    });

    await expect(provider.synthesize(input)).resolves.toEqual(output);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(requests[0]!.body).toMatchObject({
      model: "qwen3:14b", stream: true, think: false,
      options: {temperature: 0}, format: {type: "object"},
    });
    const messages = requests[0]!.body.messages as Array<{role: string; content: string}>;
    expect(messages[0]!.content).toContain("只调用一次");
    expect(messages[0]!.content).toContain("不得使用外部搜索");
    expect(messages[0]!.content).toContain("Phase 3C");
    const sent = JSON.parse(messages[1]!.content) as WholeBookSynthesisInput;
    expect(sent.claims.map((claim) => claim.claimId)).toEqual(["claim-a", "claim-b"]);
    expect(sent).not.toHaveProperty("pages");
    expect(sent).not.toHaveProperty("contentBlocks");
  });
});
