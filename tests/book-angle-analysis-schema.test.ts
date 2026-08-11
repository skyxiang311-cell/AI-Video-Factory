import {describe, expect, it} from "vitest";
import {BookAnalysisSchema} from "../src/research/book/book-analysis-schema";
import {SelectedAngleSchema, VideoAnglesSchema} from "../src/research/book/angle-schema";

const validVideoAngle = () => ({
  angleId: "angle-feedback-loop",
  title: "真正拉开差距的不是努力，而是反馈速度",
  premise: "把书中的反馈观点转化为一个可执行的练习框架。",
  eligible: true,
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
  contentBudget: {
    maxClaims: 3,
    maxExamples: 2,
    maxConcepts: 3,
  },
});

const validBookAnalysis = () => ({
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
  it("accepts scored video-angle candidates in the inclusive zero to one-hundred range", () => {
    const angles = VideoAnglesSchema.parse({candidates: [validVideoAngle()]});

    expect(angles.candidates[0]?.overallScore).toBe(88);
  });

  it("rejects any video-angle score above one hundred", () => {
    const angle = validVideoAngle();
    angle.saveValue = 101;

    expect(VideoAnglesSchema.safeParse({candidates: [angle]}).success).toBe(false);
  });

  it("parses a selected angle with a three-hundred-second content budget", () => {
    const selectedAngle = SelectedAngleSchema.parse(validSelectedAngle());

    expect(selectedAngle.targetDurationSec).toBe(300);
  });

  it("accepts each allowed downstream analysis status", () => {
    for (const status of ["processing", "blocked", "needs_review", "approved_for_video"]) {
      const analysis = validBookAnalysis();
      analysis.status = status;

      expect(BookAnalysisSchema.safeParse(analysis).success).toBe(true);
    }
  });

  it("requires quality components to sum to one hundred", () => {
    const analysis = validBookAnalysis();
    analysis.quality.narrativeReadiness = 19;

    expect(BookAnalysisSchema.safeParse(analysis).success).toBe(false);
  });
});
