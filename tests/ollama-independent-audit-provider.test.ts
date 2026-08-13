import {describe, expect, it} from "vitest";
import type {IndependentAuditInput} from "../src/research/book/independent-audit-provider";
import type {IndependentAuditDraft} from "../src/research/book/independent-audit-schema";
import {createOllamaIndependentAuditProviderFromEnv} from "../src/research/book/ollama-independent-audit-provider";

const output: IndependentAuditDraft = {
  coverageScore: 80, thesisScore: 82, evidenceScore: 84, scopeScore: 81,
  causalityScore: 79, synthesisScore: 83, traceabilityScore: 86,
  blockingIssues: [], warnings: [], strengths: [], requiredRepairs: [],
};

const input = {
  map: {chapterCount: 24, excludedLowConfidencePages: [1, 3], chapters: []},
  chapters: [], deepReads: [], synthesis: {},
} as unknown as IndependentAuditInput;

describe("Ollama independent audit provider", () => {
  it("uses local qwen3:14b by default and permits a model override", () => {
    expect(createOllamaIndependentAuditProviderFromEnv({env: {}}).model).toBe("qwen3:14b");
    expect(createOllamaIndependentAuditProviderFromEnv({env: {OLLAMA_BOOK_AUDIT_MODEL: "qwen3:30b"}}).model).toBe("qwen3:30b");
  });

  it("makes exactly one structured local auditor call", async () => {
    const requests: Array<{url: string; body: Record<string, any>}> = [];
    const provider = createOllamaIndependentAuditProviderFromEnv({
      env: {},
      fetch: async (request, init) => {
        requests.push({url: String(request), body: JSON.parse(String(init?.body))});
        return new Response(JSON.stringify({message: {content: JSON.stringify(output)}, done: true}), {status: 200});
      },
    });

    await expect(provider.audit(input)).resolves.toEqual(output);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(requests[0]!.body).toMatchObject({model: "qwen3:14b", stream: true, think: false, options: {temperature: 0}});
    const system = requests[0]!.body.messages[0].content as string;
    expect(system).toContain("Independent Auditor");
    expect(system).toContain("只调用一次");
    expect(system).toContain("Video Readiness");
    expect(system).toContain("不得补充来源中不存在的新事实");
    expect(system).toContain("缺少外部数据本身不得作为 blocking issue");
    expect(system).toContain("定义或作者判断已由原文直接支持且 scope 已明确收窄");
  });
});
