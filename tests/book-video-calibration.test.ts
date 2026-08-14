import {describe, expect, it} from "vitest";
import {BookDeepScriptSchema} from "../src/research/book/book-script-schema";
import {
  assertCalibratedBookVoiceDuration,
  calibrateBookVideoScript,
  countReadableCharacters,
  isBookVideoMaterialRepetition,
  splitVoiceTextForVisualBeats,
} from "../src/research/book/book-video-calibration";
import {buildBookVideoStoryboard} from "../src/research/book/book-video-storyboard";

const ref = (chapterId: string, page: number) => ({
  type: "book" as const,
  chapterId,
  page,
  blockId: `p${page}-b1`,
});

const timeline = [
  ["primary_hook", 0, 3], ["hook_extension", 3, 8], ["audience_relevance", 8, 30],
  ["author_core_judgment", 30, 75], ["strongest_evidence", 75, 145],
  ["second_layer_mechanism", 145, 200], ["critical_turn", 200, 245],
  ["system_judgment", 245, 285], ["memorable_ending", 285, 300],
] as const;

const baseScript = BookDeepScriptSchema.parse({
  title: "中产阶层与社会稳定", selectedAngleId: "angle-middle", centralQuestion: "中产阶层为何与社会稳定有关？",
  targetDurationSec: 300, durationSec: 300,
  segments: timeline.map(([purpose, startSec, endSec], index) => ({
    purpose, startSec, endSec,
    text: `这是第${index + 1}段口播，用来解释作者观点、证据和边界。`,
    voiceText: `这是第${index + 1}段口播，用来解释作者观点、证据和边界。`,
    claimIds: index > 1 && index < 8 ? ["claim-middle-function"] : [],
    sourceRefs: index > 1 && index < 8 ? [ref("chapter-012", 264)] : [],
    visibleSourceRequired: index === 4,
  })),
  quality: {hook:10,centralQuestion:10,narrativeCoherence:15,evidence:15,depth:15,criticalThinking:10,practicalValue:10,spokenChinese:10,ending:5,overallScore:100,blockingIssues:[],status:"PASS"},
});

const sources = {
  selectedAngle: {
    angleId: "angle-middle", title: "中产阶层与社会稳定", centralQuestion: "中产阶层为何与社会稳定有关？",
    thesis: "作者认为中产阶层是稳定社会的重要力量。",
    reason: "这个角度连接了书中的结构判断、生活条件与适用边界。",
    coreClaimIds: ["claim-middle-function", "claim-income-standard"],
    evidenceIds: ["evidence-middle-function", "evidence-income-standard"],
    sourceRefs: [ref("chapter-012", 264), ref("chapter-016", 345)],
    risks: ["只适用于书中讨论的中国社会与研究时期", "不能把作者观察直接说成普遍因果"],
  },
  synthesis: {
    coreThesis: [{statement: "中产阶层的形成对社会稳定具有重要意义。", supportingClaimIds: ["claim-middle-function", "claim-income-standard", "claim-housing"]}],
    secondaryTheses: [{statement: "经济指标需要放回书中研究语境理解。", supportingClaimIds: ["claim-income-standard", "claim-housing"]}],
    argumentMap: [{statement: "作者从群体位置延伸到社会功能判断。", supportingClaimIds: ["claim-middle-function"]}],
    keyConcepts: [{concept: "中产阶层", explanation: "书中从社会功能、经济收入和生活方式理解中产阶层。", supportingClaimIds: ["claim-middle-function", "claim-income-standard"]}],
    crossChapterPatterns: [{statement: "概念界定、指标描述和功能判断在相关章节中相互限定。", supportingClaimIds: ["claim-middle-function", "claim-income-standard"]}],
    tensions: [{statement: "稳定作用的判断与生活水平仍有提升空间同时存在。", supportingClaimIds: ["claim-middle-function", "claim-income-standard"]}],
    limitations: [{statement: "书中研究时期和中国样本限制了结论的外推范围。", supportingClaimIds: ["claim-middle-function"]}],
    readerTakeaways: [{statement: "理解中产阶层时要同时看结构位置、生活条件和证据边界。", supportingClaimIds: ["claim-middle-function", "claim-income-standard"]}],
    practicalFrameworks: [{name: "证据边界检查", steps: ["先看原文范围", "再看证据能支持到哪里", "最后保留不能外推的部分"], supportingClaimIds: ["claim-middle-function"]}],
  },
  chapters: [{
    chapterId: "chapter-012",
    claims: [{
      claimId: "claim-middle-function", statement: "中产阶层在社会中起到缓解社会对立和社会矛盾的作用，是稳定社会的重要力量。",
      authorPosition: "作者观察", scope: {appliesTo: ["书中讨论的中产阶层与社会稳定"], doesNotNecessarilyApplyTo: ["其他国家和其他时期"]},
      sourceRefs: [ref("chapter-012", 264)], bookEvidenceRefs: [ref("chapter-012", 264)], evidenceSupport: "strong",
    }],
    evidence: [{
      evidenceId: "evidence-middle-function", type: "logical_argument",
      summary: "当中产阶层成为多数时，作者认为主导价值观认同感会更强，并可能缓解社会对立。",
      originalExcerpt: "社会的主导价值观有较强的认同感，它往往起到缓解社会对立和社会矛盾的作用。",
      interpretation: "原文支持作者对社会功能的判断，但不是外部验证的普遍定律。",
      supportsClaimIds: ["claim-middle-function"], sourceRef: ref("chapter-012", 264), strength: 0.92,
    }],
  }, {
    chapterId: "chapter-016",
    claims: [{
      claimId: "claim-income-standard", statement: "家庭年人均可支配收入在2万至6.7万元之间，被书中作为中等生活水平的经济收入标准。",
      authorPosition: "作者明确主张", scope: {appliesTo: ["书中研究的中国中产阶层"], doesNotNecessarilyApplyTo: ["其他国家和其他研究时期"]},
      sourceRefs: [ref("chapter-016", 345)], bookEvidenceRefs: [ref("chapter-016", 345)], evidenceSupport: "strong",
    }, {
      claimId: "claim-housing", statement: "书中研究数据显示，大约81.05%的家庭拥有完全住房产权。",
      authorPosition: "作者明确主张", scope: {appliesTo: ["书中研究样本"], doesNotNecessarilyApplyTo: ["其他时期和总体人口"]},
      sourceRefs: [ref("chapter-016", 354)], bookEvidenceRefs: [ref("chapter-016", 354)], evidenceSupport: "strong",
    }],
    evidence: [{
      evidenceId: "evidence-income-standard", type: "statistic", summary: "家庭年人均可支配收入2万至6.7万元。",
      originalExcerpt: "收入方面，家庭年人均可支配收入2万至6.7万元。", interpretation: "该数字是书中研究时期的收入标准。",
      supportsClaimIds: ["claim-income-standard"], sourceRef: ref("chapter-016", 345), strength: 0.99,
    }, {
      evidenceId: "evidence-housing", type: "statistic", summary: "书中研究数据显示，大约81.05%的家庭拥有完全住房产权。",
      originalExcerpt: "本研究数据显示，中国大约有81.05%的家庭拥有完全住房产权。", interpretation: "这是书中样本的生活方式指标。",
      supportsClaimIds: ["claim-housing"], sourceRef: ref("chapter-016", 354), strength: 0.99,
    }],
  }],
  deepReads: [],
};

const scriptWithReadableCharacters = (target: number) => {
  const otherCharacters = baseScript.segments.reduce((sum, segment, index) =>
    index === 2 ? sum : sum + countReadableCharacters(segment.voiceText), 0);
  const replacement = `文`.repeat(target - otherCharacters);
  return BookDeepScriptSchema.parse({
    ...baseScript,
    segments: baseScript.segments.map((segment, index) => index === 2
      ? {...segment, text: replacement, voiceText: replacement}
      : segment),
  });
};

describe("Book video five-minute calibration", () => {
  it("performs at most one sourced expansion into the measured 285-315 second target", () => {
    const result = calibrateBookVideoScript({
      script: baseScript,
      sources,
      previousVoiceDurationMs: 116_808,
    });

    expect(result.expansionCount).toBe(1);
    expect(result.statistics.originalCharacters).toBe(countReadableCharacters(baseScript.segments.map((item) => item.voiceText).join("")));
    expect(result.statistics.totalCharacters).toBeGreaterThanOrEqual(1280);
    expect(result.statistics.totalCharacters).toBeLessThanOrEqual(1450);
    expect(result.statistics.estimatedVoiceDurationSec).toBeGreaterThanOrEqual(285);
    expect(result.statistics.estimatedVoiceDurationSec).toBeLessThanOrEqual(315);
    expect(result.script.segments.slice(2, 8).every((segment) => segment.claimIds.length > 0 && segment.sourceRefs.length > 0)).toBe(true);
    expect(result.script.segments[4]!.claimIds).toContain("claim-housing");
    const sentences = result.script.segments.flatMap((segment) => segment.voiceText.split(/[。！？]/u).map((value) => value.trim()).filter(Boolean));
    expect(new Set(sentences).size).toBe(sentences.length);

    const second = calibrateBookVideoScript({script: result.script, sources, previousVoiceDurationMs: result.statistics.estimatedVoiceDurationSec * 1000});
    expect(second.expansionCount).toBe(0);
    expect(second.script).toEqual(result.script);
  });

  it("splits spoken Chinese into stable visual beats without losing text", () => {
    const text = "作者先提出一个判断，接着给出可以追溯的证据，然后说明证据的范围，最后保留不能证明的部分。";
    const parts = splitVoiceTextForVisualBeats(text);
    expect(parts.join("")).toBe(text);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts.every((part) => countReadableCharacters(part) <= 32)).toBe(true);
  });

  it("turns the calibrated narration into sub-ten-second animated visual beats", () => {
    const calibrated = calibrateBookVideoScript({script: baseScript, sources, previousVoiceDurationMs: 116_808}).script;
    const storyboard = buildBookVideoStoryboard("sample-book", calibrated);
    expect(storyboard.scenes.length).toBeGreaterThan(24);
    expect(Math.max(...storyboard.scenes.map((scene) => scene.endMs - scene.startMs))).toBeLessThanOrEqual(10_000);
    expect(storyboard.narration.blocks.length).toBeLessThan(storyboard.scenes.length);
    expect(storyboard.narration.blocks.flatMap((block) => block.sceneIds)).toHaveLength(storyboard.scenes.length);
  });

  it("accepts only a genuinely five-minute natural voice track", () => {
    expect(() => assertCalibratedBookVoiceDuration(284_999)).toThrow(/285/);
    expect(() => assertCalibratedBookVoiceDuration(285_000)).not.toThrow();
    expect(() => assertCalibratedBookVoiceDuration(315_000)).not.toThrow();
    expect(() => assertCalibratedBookVoiceDuration(315_001)).toThrow(/315/);
  });

  it("expands an estimated 280-second draft but rejects an overlong one without compression", () => {
    const short = scriptWithReadableCharacters(1268);
    expect(calibrateBookVideoScript({script: short, sources, previousVoiceDurationMs: 280_000}).expansionCount).toBe(1);
    const long = scriptWithReadableCharacters(1435);
    expect(() => calibrateBookVideoScript({script: long, sources, previousVoiceDurationMs: 316_000})).toThrow(/超过 315/);
  });

  it("does not restate a short scope risk already embedded in a longer original sentence", () => {
    const original = "该研究仅适用于改革开放后的中国社会，且样本仅针对中国中产阶层，无法外推到其他国家或时期。";
    expect(isBookVideoMaterialRepetition("时间限制：仅适用于改革开放后的中国社会", [original])).toBe(true);
    expect(isBookVideoMaterialRepetition("范围限制：不适用于其他国家或时期", [original])).toBe(true);
  });
});
