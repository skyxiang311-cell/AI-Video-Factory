import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {BookAnalysisSchema} from "../src/research/book/book-analysis-schema";
import {SelectedAngleSchema, VideoAnglesSchema} from "../src/research/book/angle-schema";
import type {DeepReadingBlockingIssue} from "../src/research/book/quality-gate";

const loadBookFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const validVideoAngle = () => ({
  angleId: "angle-feedback-loop",
  title: "真正拉开差距的不是努力，而是反馈速度",
  premise: "把书中的反馈观点转化为一个可执行的练习框架。",
  eligible: true,
  recommended: true,
  claimIds: ["claim-focused-practice"],
  audienceRelevance: 92,
  practicalValue: 90,
  counterIntuitiveScore: 76,
  evidenceStrength: 88,
  narrativePotential: 84,
  saveValue: 91,
  originalInsight: 82,
  titleIntegrityScore: 95,
  faithfulnessPenalty: 0,
  overclaimPenalty: 0,
  evidencePenalty: 0,
  overallScore: 88,
});

const validSelectedAngle = () => ({
  angleId: "angle-feedback-loop",
  title: "真正拉开差距的不是努力，而是反馈速度",
  targetDurationSec: 300,
  centralQuestion: "为什么反馈速度比单纯努力更重要？",
  thesis: "快速、具体的反馈让练习能够持续纠错。",
  mustInclude: {
    claims: ["claim-focused-practice"],
    evidence: ["evidence-practice-study"],
    examples: ["每次练习后记录一个可验证改进点。"],
    counterpoints: ["重复仍然有用，但没有反馈时效率有限。"],
  },
  optional: ["补充一个日常练习案例。"],
  exclude: ["未经核验的泛化结论。"],
  sourceDisplayRequirements: ["展示书页与外部研究的来源标识。"],
  desiredViewerTakeaway: "下一次练习时，优先缩短获得反馈的时间。",
  endingJudgment: "把练习设计成反馈回路，而不是单纯重复。",
  contentBudget: {
    maxClaims: 3,
    maxExamples: 2,
    maxConcepts: 3,
  },
});

const validBookAnalysis = () => ({
  bookId: "book-focused-practice",
  deepReadingScore: 88,
  coreThesis: "Focused practice works because feedback turns effort into correction.",
  keyConcepts: ["focused practice", "feedback"],
  coreClaimIds: ["claim-focused-practice"],
  verifiedClaimIds: ["claim-focused-practice"],
  importantLimitations: ["The result depends on timely feedback."],
  practicalFrameworks: ["practice-feedback-adjust"],
  recommendedAngleId: "angle-feedback-loop",
  artifacts: {
    source: "sample-book-source.json",
    chapters: ["sample-chapter-analysis.json"],
    synthesis: "sample-book-synthesis.json",
    verification: "sample-verification.json",
    angles: "sample-video-angles.json",
    selectedAngle: "sample-selected-angle.json",
  },
  qualityGate: {
    passed: true,
    status: "approved_for_video",
    score: 88,
    blockingIssues: [] as DeepReadingBlockingIssue[],
  },
  synthesis: {
    coreThesis: "Focused practice works because feedback turns effort into correction.",
    claimRelations: [],
  },
  verificationRecords: [],
  videoAngles: {candidates: [validVideoAngle()]},
  selectedAngle: validSelectedAngle(),
  status: "approved_for_video",
  quality: {
    sourceFidelity: 30,
    evidenceQuality: 25,
    audienceValue: 25,
    narrativeReadiness: 20,
  },
});

describe("book angle and unified analysis schemas", () => {
  it("requires and preserves an explicit recommendation decision for every candidate", () => {
    const recommended = VideoAnglesSchema.parse({candidates: [validVideoAngle()]});
    const missingDecision = validVideoAngle();
    delete (missingDecision as Partial<typeof missingDecision>).recommended;

    expect(recommended.candidates[0]?.recommended).toBe(true);
    expect(VideoAnglesSchema.safeParse({candidates: [missingDecision]}).success).toBe(false);
  });

  it("parses three synthetic angle candidates, one recommendation, and a five-minute selected angle", async () => {
    const angles = VideoAnglesSchema.parse(await loadBookFixture("sample-video-angles.json"));
    const selected = SelectedAngleSchema.parse(await loadBookFixture("sample-selected-angle.json"));
    const analysis = BookAnalysisSchema.parse(await loadBookFixture("sample-book-analysis.json"));

    expect(angles.candidates).toHaveLength(3);
    expect(angles.candidates.filter((angle) => angle.recommended)).toHaveLength(1);
    expect(selected.targetDurationSec).toBe(300);
    expect(analysis.deepReadingScore).toBeGreaterThanOrEqual(85);
  });

  it("accepts scored video-angle candidates in the inclusive zero to one-hundred range", () => {
    const angles = VideoAnglesSchema.parse({candidates: [validVideoAngle()]});

    expect(angles.candidates[0]?.overallScore).toBe(88);
    expect(angles.candidates[0]?.claimIds).toEqual(["claim-focused-practice"]);
  });

  it("rejects a video angle without at least one source claim id", () => {
    const angle = validVideoAngle();
    angle.claimIds = [];

    expect(VideoAnglesSchema.safeParse({candidates: [angle]}).success).toBe(false);
  });

  it("rejects any video-angle score above one hundred", () => {
    const angle = validVideoAngle();
    angle.saveValue = 101;

    expect(VideoAnglesSchema.safeParse({candidates: [angle]}).success).toBe(false);
  });

  it("parses a selected angle with a three-hundred-second content budget", () => {
    const selectedAngle = SelectedAngleSchema.parse(validSelectedAngle());

    expect(selectedAngle.targetDurationSec).toBe(300);
    expect(selectedAngle.mustInclude.claims).toEqual(["claim-focused-practice"]);
  });

  it("rejects a selected angle whose duration is not exactly three hundred seconds", () => {
    const selectedAngle = validSelectedAngle();
    selectedAngle.targetDurationSec = 301;

    expect(SelectedAngleSchema.safeParse(selectedAngle).success).toBe(false);
  });

  it("indexes the required downstream book-analysis fields", () => {
    const analysis = BookAnalysisSchema.parse(validBookAnalysis());

    expect(analysis).toMatchObject({
      bookId: "book-focused-practice",
      deepReadingScore: 88,
      coreClaimIds: ["claim-focused-practice"],
      verifiedClaimIds: ["claim-focused-practice"],
      recommendedAngleId: "angle-feedback-loop",
      artifacts: {verification: "sample-verification.json"},
      qualityGate: {passed: true},
    });
  });

  it("accepts each allowed downstream analysis status", () => {
    for (const status of ["processing", "blocked", "needs_review", "approved_for_video"]) {
      const analysis = validBookAnalysis();
      analysis.status = status;
      const score = status === "blocked" ? 74 : status === "needs_review" ? 80 : 88;
      analysis.deepReadingScore = score;
      analysis.qualityGate = {
        passed: status === "approved_for_video",
        status,
        score,
        blockingIssues: [],
      };

      expect(BookAnalysisSchema.safeParse(analysis).success).toBe(true);
    }
  });

  it("rejects an approved analysis whose recorded quality gate is blocked", () => {
    const analysis = validBookAnalysis();
    analysis.status = "approved_for_video";
    analysis.qualityGate = {
      passed: false,
      status: "blocked",
      score: 88,
      blockingIssues: ["SELECTED_ANGLE_USES_UNVERIFIED_EVIDENCE"],
    };

    expect(BookAnalysisSchema.safeParse(analysis).success).toBe(false);
  });

  it("requires quality components to sum to one hundred", () => {
    const analysis = validBookAnalysis();
    analysis.quality.narrativeReadiness = 19;

    expect(BookAnalysisSchema.safeParse(analysis).success).toBe(false);
  });
});
