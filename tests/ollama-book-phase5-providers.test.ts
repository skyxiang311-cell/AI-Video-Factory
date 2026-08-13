import {describe, expect, it} from "vitest";
import type {BookScriptInput} from "../src/research/book/book-script-provider";
import type {BookScriptDraft} from "../src/research/book/book-script-schema";
import type {BookVideoAngleInput} from "../src/research/book/book-video-angle-provider";
import type {BookVideoAngleDraftSet} from "../src/research/book/book-video-angle-schema";
import {createOllamaBookScriptProviderFromEnv} from "../src/research/book/ollama-book-script-provider";
import {createOllamaBookVideoAngleProviderFromEnv} from "../src/research/book/ollama-book-video-angle-provider";

const refs = [
  {type: "book" as const, chapterId: "chapter-a", page: 10, blockId: "p10-b1"},
  {type: "book" as const, chapterId: "chapter-b", page: 20, blockId: "p20-b1"},
];
const angleInput: BookVideoAngleInput = {
  supportBundles: [{bundleId: "bundle-middle-class", statement: "中产阶层的社会功能与生活标准形成一组可比较判断。", claimIds: ["claim-a", "claim-b"], perspective: "system_synthesis"}],
  synthesis: {
    coreTheses: [{statement: "复盘形成可验证改动。", claimIds: ["claim-a"]}],
    tensions: [{statement: "统计不能外推。", claimIds: ["claim-b"]}],
    limitations: [{statement: "研究时期有限。", claimIds: ["claim-b"]}],
    practicalFrameworks: [], readerTakeaways: [],
  },
  claims: [
    {claimId: "claim-a", chapterId: "chapter-a", statement: "复盘形成可验证改动。", authorPosition: "作者判断", scope: {appliesTo: ["书中情境"], doesNotNecessarilyApplyTo: ["其他情境"]}, importance: 90, evidence: [{evidenceId: "evidence-a", type: "author_observation", summary: "可验证改动", originalExcerpt: "可验证改动", strength: 0.9, sourceRef: refs[0]!}], sourceRefs: [refs[0]!]},
    {claimId: "claim-b", chapterId: "chapter-b", statement: "统计不能外推。", authorPosition: "作者判断", scope: {appliesTo: ["书中样本"], doesNotNecessarilyApplyTo: ["其他样本"]}, importance: 85, evidence: [{evidenceId: "evidence-b", type: "statistic", summary: "样本有限", originalExcerpt: "样本有限", strength: 0.9, sourceRef: refs[1]!}], sourceRefs: [refs[1]!]},
  ],
  deepReadCritiques: [],
};
const angleOutput: BookVideoAngleDraftSet = {candidates: Array.from({length: 8}, (_, index) => ({
  angleId: `angle-${index}`,
  title: `复盘的隐藏条件 ${index}`,
  centralQuestion: `复盘何时改变行动 ${index}？`,
  thesis: "形成可验证改动并保留证据边界。",
  coreClaimIds: ["claim-a", "claim-b"], evidenceIds: ["evidence-a", "evidence-b"], sourceRefs: refs,
  angleType: "hidden_mechanism", audienceRelevance: 90, practicalValue: 90, counterIntuitiveScore: 80,
  evidenceStrength: 90, narrativePotential: 90, saveValue: 90, originalInsight: 85, titleIntegrityScore: 95,
  faithfulnessPenalty: 0, overclaimPenalty: 0, evidencePenalty: 0, overallScore: 90, eligible: true,
  reason: "双重支撑。", risks: ["不外推。"],
}))};
const scriptInput: BookScriptInput = {
  selectedAngle: {...angleOutput.candidates[0]!, targetDurationSec: 300},
  claims: angleInput.claims.map((claim) => ({...claim, evidence: claim.evidence.map(({strength: _strength, ...item}) => item)})),
  tensions: ["统计不能外推。"], limitations: ["研究时期有限。"],
  phase3CCritiques: [{chapterId: "chapter-b", claimId: "claim-b", evidenceLimits: ["不能外推。"], causalAssessment: ["只能说明关联。"], scopeCorrections: ["仅限样本。"], tensionsAndContradictions: [], finalJudgment: "保留边界。", sourceRefs: [refs[1]!]}],
};
const specs = [
  ["primary_hook", 0, 3], ["hook_extension", 3, 8], ["audience_relevance", 8, 30],
  ["author_core_judgment", 30, 75], ["strongest_evidence", 75, 145], ["second_layer_mechanism", 145, 200],
  ["critical_turn", 200, 245], ["system_judgment", 245, 285], ["memorable_ending", 285, 300],
] as const;
const scriptOutput: BookScriptDraft = {
  title: scriptInput.selectedAngle.title, selectedAngleId: scriptInput.selectedAngle.angleId,
  centralQuestion: scriptInput.selectedAngle.centralQuestion, targetDurationSec: 300,
  segments: specs.map(([purpose, startSec, endSec]) => ({text: "口语稿。", voiceText: "口语稿。", purpose, startSec, endSec, claimIds: ["claim-a"], sourceRefs: [refs[0]!], visibleSourceRequired: false})),
  quality: {hook: 9, centralQuestion: 9, narrativeCoherence: 14, evidence: 14, depth: 14, criticalThinking: 9, practicalValue: 9, spokenChinese: 9, ending: 5},
};

const responseFor = (value: unknown): Response => new Response(`${JSON.stringify({message: {content: JSON.stringify(value)}})}\n`, {status: 200});

describe("Ollama Phase 5 providers", () => {
  it("uses local qwen3:14b and sends one structured angle request containing only PASS artifact data", async () => {
    const requests: Array<{url: string; body: any}> = [];
    const provider = createOllamaBookVideoAngleProviderFromEnv({env: {}, fetch: async (url, init) => {
      requests.push({url: String(url), body: JSON.parse(String(init?.body))});
      return responseFor(angleOutput);
    }});

    await expect(provider.generateAngles(angleInput)).resolves.toEqual(angleOutput);
    expect(provider.model).toBe("qwen3:14b");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(requests[0]!.body).toMatchObject({model: "qwen3:14b", stream: true, think: false, format: {type: "object"}});
    expect(requests[0]!.body.messages[0].content).toContain("8-12");
    expect(requests[0]!.body.messages[0].content).toContain("不得使用外部事实");
  });

  it("sends one structured five-minute script request and includes concrete retry feedback", async () => {
    const requests: any[] = [];
    const provider = createOllamaBookScriptProviderFromEnv({env: {OLLAMA_BOOK_SCRIPT_MODEL: "qwen3:30b"}, fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return responseFor(scriptOutput);
    }});

    await expect(provider.generateScript(scriptInput, ["QUALITY_SCORE_BELOW_80 actual=72"])).resolves.toEqual(scriptOutput);
    expect(provider.model).toBe("qwen3:30b");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({model: "qwen3:30b", stream: true, think: false, format: {type: "object"}});
    expect(requests[0].messages[0].content).toContain("0-3秒");
    expect(requests[0].messages[0].content).toContain("Phase 3C");
    expect(requests[0].messages[1].content).toContain("QUALITY_SCORE_BELOW_80");
  });
});
