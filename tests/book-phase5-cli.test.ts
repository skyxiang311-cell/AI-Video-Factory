import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {runBookAnglesCli} from "../scripts/book-angles";
import {runBookScriptCli} from "../scripts/book-script";
import type {BookScriptProvider} from "../src/research/book/book-script-provider";
import type {BookVideoAngleProvider} from "../src/research/book/book-video-angle-provider";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {IndependentAuditSchema} from "../src/research/book/independent-audit-schema";
import {InterrogativeDeepReadSchema} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";

const cwd = process.cwd();
const directory = resolve(".cache/book-phase5-cli-test");
const load = async (name: string): Promise<any> => JSON.parse(await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"));

beforeEach(async () => { await rm(directory, {recursive: true, force: true}); await mkdir(directory, {recursive: true}); process.chdir(directory); });
afterEach(async () => { process.chdir(cwd); await rm(directory, {recursive: true, force: true}); });

describe("Phase 5 CLIs", () => {
  it("writes book angle artifacts and then output/<job-id>/script.json", async () => {
    const base = resolve("output/sample/book");
    await mkdir(resolve(base, "chapters"), {recursive: true});
    await mkdir(resolve(base, "deep-read"), {recursive: true});
    const map = BookMapSchema.parse(await load("sample-book-map.json"));
    const raw = ChapterAnalysisSchema.parse(await load("sample-chapter-analysis.json"));
    const analysis = ChapterAnalysisSchema.parse({...raw, quality: {confidence: 0.95, status: "PASS", blockingIssues: []}, evidence: raw.evidence.map((item) => ({...item, strength: 0.9})), claims: raw.claims.map((claim) => ({...claim, verificationStatus: "not_required", evidenceSupport: "strong"}))});
    const claimIds = analysis.claims.map((claim) => claim.claimId);
    const critique = InterrogativeDeepReadSchema.parse({
      chapterId: analysis.chapterId,
      originalClaims: [{claimId: claimIds[1], statement: analysis.claims[1]!.statement, classification: "author_judgment", sourceRefs: analysis.claims[1]!.bookEvidenceRefs}],
      revisedClaims: [],
      evidenceLimits: [{claimId: claimIds[1], proves: "只支持书内样本。", doesNotProve: "不能证明普遍因果。", sourceRefs: analysis.claims[1]!.bookEvidenceRefs}],
      causalAssessment: [{claimId: claimIds[1], status: "association_only", assessment: "只能说明相关。", sourceRefs: analysis.claims[1]!.bookEvidenceRefs}],
      hiddenAssumptions: [], counterpoints: [{statement: "存在其他解释。", sourceRefs: analysis.claims[1]!.bookEvidenceRefs}], contradictions: [],
      scopeCorrections: [{claimId: claimIds[1], correction: "仅限书内样本。", sourceRefs: analysis.claims[1]!.bookEvidenceRefs}],
      unresolvedQuestions: [], relationsToOtherChapters: [], finalJudgment: "保留边界后使用。", confidence: 0.9, sourceRefs: analysis.claims[1]!.bookEvidenceRefs,
    });
    const synthesis = {
      coreThesis: [{statement: analysis.claims[0]!.statement, confidence: 0.9, supportingClaimIds: [claimIds[0]], perspective: "system_synthesis"}], secondaryTheses: [],
      argumentMap: [{statement: "跨 Claim 综合。", perspective: "author_view", supportingClaimIds: claimIds}], keyConcepts: [{concept: "复盘", explanation: "行动反馈。", supportingClaimIds: [claimIds[0]]}],
      crossChapterPatterns: [{statement: "定义与边界。", chapterIds: [analysis.chapterId, "chapter-micro-retrospective"], supportingClaimIds: claimIds}], tensions: [{statement: "不能外推。", perspective: "phase3c_critique", supportingClaimIds: [claimIds[1]]}], limitations: [{statement: "样本有限。", perspective: "phase3c_critique", supportingClaimIds: [claimIds[1]]}], practicalFrameworks: [], readerTakeaways: [{statement: "保留边界。", supportingClaimIds: [claimIds[0]]}],
      relations: [{fromClaimId: claimIds[0], toClaimId: claimIds[1], relation: "supports"}, {fromClaimId: claimIds[1], toClaimId: claimIds[0], relation: "qualifies"}, {fromClaimId: claimIds[0], toClaimId: claimIds[1], relation: "explains"}],
    };
    const audit = IndependentAuditSchema.parse({coverageScore: 90, thesisScore: 90, evidenceScore: 90, scopeScore: 90, causalityScore: 90, synthesisScore: 90, traceabilityScore: 90, overallScore: 90, blockingIssues: [], warnings: [], strengths: [], requiredRepairs: [], videoReady: true, status: "PASS"});
    await Promise.all([
      writeFile(resolve(base, "book-map.json"), JSON.stringify(map)), writeFile(resolve(base, "book-synthesis.json"), JSON.stringify(synthesis)), writeFile(resolve(base, "audit.json"), JSON.stringify(audit)), writeFile(resolve(base, "chapters", `${analysis.chapterId}.json`), JSON.stringify(analysis)), writeFile(resolve(base, "deep-read", `${critique.chapterId}.json`), JSON.stringify(critique)),
    ]);
    const angleProvider: BookVideoAngleProvider = {provider: "synthetic", model: "v1", generateAngles: async (input) => ({candidates: Array.from({length: 8}, (_, index) => ({angleId: `angle-${index}`, title: `微型复盘为什么要让反馈赶在下一次行动前${"甲乙丙丁戊己庚辛"[index]}`, centralQuestion: `为什么微型复盘需要让反馈赶在下一次行动前${"甲乙丙丁戊己庚辛"[index]}？`, thesis: "每次行动后的微型复盘，只有让具体反馈在下一次行动前到达，并把偏差变成下一轮可检验的调整，才可能积累可纠正的学习线索。", coreClaimIds: claimIds, evidenceIds: analysis.evidence.map((item) => item.evidenceId), sourceRefs: analysis.claims.flatMap((claim) => claim.bookEvidenceRefs), angleType: "hidden_mechanism", audienceRelevance: 90-index, practicalValue: 90-index, counterIntuitiveScore: 85-index, evidenceStrength: 90-index, narrativePotential: 90-index, saveValue: 90-index, originalInsight: 88-index, titleIntegrityScore: 95, faithfulnessPenalty: 0, overclaimPenalty: 0, evidencePenalty: 0, overallScore: 1, eligible: true, reason: "双重支撑。", risks: ["不外推。"]}))})};
    const angleOut: string[] = [];
    expect(await runBookAnglesCli({argv: ["sample"], provider: angleProvider, stdout: (line) => angleOut.push(line), stderr: () => undefined})).toBe(0);
    const selected = JSON.parse(await readFile(resolve(base, "selected-angle.json"), "utf8"));
    const timeline = [["primary_hook",0,3],["hook_extension",3,8],["audience_relevance",8,30],["author_core_judgment",30,75],["strongest_evidence",75,145],["second_layer_mechanism",145,200],["critical_turn",200,245],["system_judgment",245,285],["memorable_ending",285,300]] as const;
    const scriptProvider: BookScriptProvider = {provider: "synthetic", model: "v1", generateScript: async (input) => ({title: input.selectedAngle.title, selectedAngleId: input.selectedAngle.angleId, centralQuestion: input.selectedAngle.centralQuestion, targetDurationSec: 300, segments: timeline.map(([purpose,startSec,endSec], index) => ({text: index === 7 ? "我们的判断是保留范围。" : "书中观点保留范围。", voiceText: index === 7 ? "我们的判断是保留范围。" : "书中观点保留范围。", purpose, startSec, endSec, claimIds: [purpose === "critical_turn" ? input.phase3CCritiques[0]!.claimId : claimIds[index%2]!], sourceRefs: purpose === "critical_turn" ? input.phase3CCritiques[0]!.sourceRefs : analysis.claims[index%2]!.bookEvidenceRefs, visibleSourceRequired: index === 4})), quality: {hook: 9, centralQuestion: 9, narrativeCoherence: 14, evidence: 14, depth: 14, criticalThinking: 9, practicalValue: 9, spokenChinese: 9, ending: 5}})};
    const scriptOut: string[] = [];
    expect(await runBookScriptCli({argv: ["sample"], provider: scriptProvider, stdout: (line) => scriptOut.push(line), stderr: () => undefined})).toBe(0);

    expect(JSON.parse(angleOut[0]!)).toMatchObject({jobId: "sample", selectedAngle: selected.title, candidateCount: 5});
    expect(JSON.parse(scriptOut[0]!)).toMatchObject({jobId: "sample", durationSec: 300, qualityScore: 92, blockingIssues: []});
    expect(JSON.parse(await readFile(resolve("output/sample/script.json"), "utf8"))).toHaveProperty("quality.status", "PASS");
  });
});
