import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import type {BookScriptInput, BookScriptProvider} from "../src/research/book/book-script-provider";
import {createOrReuseBookScript} from "../src/research/book/book-script-service";
import {BookDeepScriptSchema, type BookScriptDraft} from "../src/research/book/book-script-schema";
import {BookSelectedAngleSchema} from "../src/research/book/book-video-angle-schema";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true}))));

const refs = [
  {type: "book" as const, chapterId: "chapter-a", page: 10, blockId: "p10-b1"},
  {type: "book" as const, chapterId: "chapter-b", page: 20, blockId: "p20-b1"},
];
const selectedAngle = BookSelectedAngleSchema.parse({
  angleId: "angle-feedback",
  title: "复盘真正改变行动的隐藏条件",
  centralQuestion: "复盘什么时候才能真正改变下一次行动？",
  thesis: "复盘必须形成可验证改动，并尊重证据范围。",
  coreClaimIds: ["claim-a", "claim-b"],
  evidenceIds: ["evidence-a", "evidence-b"],
  sourceRefs: refs,
  angleType: "hidden_mechanism",
  audienceRelevance: 90, practicalValue: 90, counterIntuitiveScore: 82, evidenceStrength: 92,
  narrativePotential: 88, saveValue: 89, originalInsight: 87, titleIntegrityScore: 95,
  faithfulnessPenalty: 0, overclaimPenalty: 0, evidencePenalty: 0, overallScore: 90,
  eligible: true, reason: "证据充分。", risks: ["不能外推。"], targetDurationSec: 300,
});

const segmentSpecs = [
  ["primary_hook", 0, 3], ["hook_extension", 3, 8], ["audience_relevance", 8, 30],
  ["author_core_judgment", 30, 75], ["strongest_evidence", 75, 145],
  ["second_layer_mechanism", 145, 200], ["critical_turn", 200, 245],
  ["system_judgment", 245, 285], ["memorable_ending", 285, 300],
] as const;

const draft = (score = 90): BookScriptDraft => ({
  title: selectedAngle.title,
  selectedAngleId: selectedAngle.angleId,
  centralQuestion: selectedAngle.centralQuestion,
  targetDurationSec: 300,
  segments: segmentSpecs.map(([purpose, startSec, endSec], index) => ({
    text: index === 7
      ? "我们的判断是只讨论复盘如何形成可验证改动，并保留作者研究时期和证据边界。"
      : "书中只讨论复盘如何形成可验证改动，并保留作者研究时期和证据边界。",
    voiceText: index === 7
      ? "我们的判断是只讨论复盘如何形成可验证改动，并保留作者研究时期和证据边界。"
      : "书中只讨论复盘如何形成可验证改动，并保留作者研究时期和证据边界。",
    purpose,
    startSec,
    endSec,
    claimIds: index === 0 ? [] : [purpose === "critical_turn" ? "claim-b" : index % 2 === 0 ? "claim-a" : "claim-b"],
    sourceRefs: index === 0 ? [] : [purpose === "critical_turn" ? refs[1]! : refs[index % 2]!],
    visibleSourceRequired: index === 4,
  })),
  quality: {
    hook: score >= 80 ? 9 : 4,
    centralQuestion: score >= 80 ? 9 : 5,
    narrativeCoherence: score >= 80 ? 14 : 8,
    evidence: score >= 80 ? 14 : 8,
    depth: score >= 80 ? 14 : 8,
    criticalThinking: score >= 80 ? 9 : 5,
    practicalValue: score >= 80 ? 9 : 5,
    spokenChinese: score >= 80 ? 9 : 5,
    ending: score >= 80 ? 5 : 2,
  },
});

const input = {
  selectedAngle,
  claims: [
    {claimId: "claim-a", statement: "作者提出可验证改动。", authorPosition: "作者观点", scope: {appliesTo: ["书中情境"], doesNotNecessarilyApplyTo: ["其他情境"]}, evidence: [{evidenceId: "evidence-a", type: "author_observation", summary: "可验证改动", originalExcerpt: "可验证改动", sourceRef: refs[0]!}], sourceRefs: [refs[0]!]},
    {claimId: "claim-b", statement: "统计不能外推。", authorPosition: "作者观点", scope: {appliesTo: ["书中样本"], doesNotNecessarilyApplyTo: ["其他样本"]}, evidence: [{evidenceId: "evidence-b", type: "statistic", summary: "样本有限", originalExcerpt: "样本有限", sourceRef: refs[1]!}], sourceRefs: [refs[1]!]},
  ],
  tensions: ["统计不能外推。"],
  limitations: ["只适用于书中样本。"],
  phase3CCritiques: [{
    chapterId: "chapter-b",
    claimId: "claim-b",
    evidenceLimits: ["书中样本不能证明其他人群。"],
    causalAssessment: ["只能说明关联，不能证明因果。"],
    scopeCorrections: ["仅限书中样本。"],
    tensionsAndContradictions: ["统计与普遍结论存在张力。"],
    finalJudgment: "保留边界后才可使用。",
    sourceRefs: [refs[1]!],
  }],
};

class Provider implements BookScriptProvider {
  readonly provider = "synthetic";
  readonly model = "synthetic-v1";
  calls: Array<{input: BookScriptInput; issues?: string[]}> = [];
  async generateScript(value: BookScriptInput, issues?: string[]) {
    this.calls.push({input: structuredClone(value), issues});
    return draft(this.calls.length === 1 ? 60 : 90);
  }
}

describe("five-minute book script service", () => {
  it("feeds concrete quality issues back once, persists a 300-second PASS script, and caches it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-script-"));
    directories.push(directory);
    const provider = new Provider();
    const outputPath = join(directory, "script.json");
    const cachePath = join(directory, ".cache", "script.json");
    const run = () => createOrReuseBookScript({input, provider, outputPath, cachePath, createdAt: "2026-08-14T00:00:00.000Z"});

    const first = await run();
    const second = await run();

    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]!.issues?.join(" ")).toContain("80");
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(first.script.durationSec).toBe(300);
    expect(first.script.quality.overallScore).toBe(92);
    expect(first.script.quality.status).toBe("PASS");
    expect(first.script.quality.blockingIssues).toEqual([]);
    expect(first.script.segments[0]).toMatchObject({purpose: "primary_hook", startSec: 0, endSec: 3});
    expect(BookDeepScriptSchema.parse(JSON.parse(await readFile(outputPath, "utf8")))).toEqual(first.script);
  });

  it("blocks dangling claim/source refs and never retries more than once", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-script-"));
    directories.push(directory);
    const provider = new Provider();
    provider.generateScript = async (value, issues) => {
      provider.calls.push({input: structuredClone(value), issues});
      const invalid = draft(90);
      invalid.segments[4]!.claimIds = ["claim-missing"];
      invalid.segments[4]!.sourceRefs = [{type: "book", chapterId: "chapter-x", page: 99, blockId: "p99-b1"}];
      return invalid;
    };

    await expect(createOrReuseBookScript({
      input, provider,
      outputPath: join(directory, "script.json"),
      cachePath: join(directory, ".cache", "script.json"),
    })).rejects.toThrow("SCRIPT_QUALITY_BLOCKED");
    expect(provider.calls).toHaveLength(2);
  });

  it("requires segment 7 to cite a real structured Phase 3C critique and its sourceRef", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-script-"));
    directories.push(directory);
    const provider = new Provider();
    provider.generateScript = async (value, issues) => {
      provider.calls.push({input: structuredClone(value), issues});
      const invalid = draft(90);
      invalid.segments[6]!.claimIds = ["claim-a"];
      invalid.segments[6]!.sourceRefs = [refs[0]!];
      return invalid;
    };

    await expect(createOrReuseBookScript({
      input, provider,
      outputPath: join(directory, "script.json"),
      cachePath: join(directory, ".cache", "script.json"),
    })).rejects.toThrow("PHASE3C_CRITIQUE_MISSING");
    expect(provider.calls).toHaveLength(2);
  });
});
