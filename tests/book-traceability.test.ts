import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import * as traceability from "../src/research/book/traceability";
import {
  validateAngleRefs,
  validateBookSourceRefs,
  validateEvidenceRefs,
  validateSelectedAngleRefs,
} from "../src/research/book/traceability";
import {VideoAnglesSchema} from "../src/research/book/angle-schema";
import {BookAnalysisSchema} from "../src/research/book/book-analysis-schema";
import {BookSourceSchema} from "../src/research/book/source-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {SelectedAngleSchema} from "../src/research/book/angle-schema";
import {BookSynthesisSchema} from "../src/research/book/synthesis-schema";
import {VerificationRecordSchema} from "../src/research/book/verification-schema";

const loadBookFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const bookSource = {
  pages: [
    {
      page: 2,
      contentBlocks: [
        {chapterId: "chapter-practice", page: 2, blockId: "p2-b1"},
      ],
    },
  ],
};

const claim = {
  claimId: "claim-focused-practice",
  bookEvidenceRefs: [
    {type: "book" as const, chapterId: "chapter-practice", page: 2, blockId: "p2-b1"},
  ],
  sourceRefs: [
    {type: "book" as const, chapterId: "chapter-practice", page: 2, blockId: "p2-b1"},
  ],
};

const evidence = {
  evidenceId: "evidence-practice-study",
  supportsClaimIds: ["claim-focused-practice"],
  sourceRef: {type: "book" as const, chapterId: "chapter-practice", page: 2, blockId: "p2-b1"},
};

const chapterAnalysis = () => ({
  chapterId: "chapter-practice",
  claims: [{...claim}],
  evidence: [{...evidence}],
});

const videoAngle = (claimIds: string[]) => ({
  angleId: "angle-focus",
  title: "Focus creates better feedback loops.",
  premise: "Use focused practice to improve feedback quality.",
  eligible: true,
  recommended: false,
  claimIds,
  audienceRelevance: 90,
  practicalValue: 90,
  counterIntuitiveScore: 80,
  evidenceStrength: 90,
  narrativePotential: 80,
  saveValue: 90,
  originalInsight: 80,
  titleIntegrityScore: 90,
  overallScore: 85,
});

const validateArtifactGraph = (graph: unknown) => {
  const validator = Reflect.get(traceability, "validateBookArtifactGraph") as
    | ((input: unknown) => ReturnType<typeof validateBookSourceRefs>)
    | undefined;

  expect(validator).toBeTypeOf("function");
  return validator!(graph);
};

const loadValidArtifactGraph = async () => {
  const [source, chapter, synthesis, verificationRecords, videoAngles, selectedAngle, analysis] =
    await Promise.all([
      loadBookFixture("sample-book-source.json").then((fixture) => BookSourceSchema.parse(fixture)),
      loadBookFixture("sample-chapter-analysis.json").then((fixture) => ChapterAnalysisSchema.parse(fixture)),
      loadBookFixture("sample-book-synthesis.json").then((fixture) => BookSynthesisSchema.parse(fixture)),
      loadBookFixture("sample-verification.json").then((fixture) =>
        VerificationRecordSchema.array().parse(fixture)),
      loadBookFixture("sample-video-angles.json").then((fixture) => VideoAnglesSchema.parse(fixture)),
      loadBookFixture("sample-selected-angle.json").then((fixture) => SelectedAngleSchema.parse(fixture)),
      loadBookFixture("sample-book-analysis.json").then((fixture) => BookAnalysisSchema.parse(fixture)),
    ]);

  return {
    bookSource: source,
    chapterAnalyses: [chapter],
    synthesis,
    verificationRecords,
    videoAngles,
    selectedAngle,
    analysis,
  };
};

describe("book traceability validation", () => {
  it("blocks eligible angles that depend on an unverified Claim", async () => {
    const graph = await loadValidArtifactGraph();
    graph.videoAngles.candidates[0]!.eligible = true;
    graph.videoAngles.candidates[1]!.eligible = true;

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "INELIGIBLE_ANGLE_CLAIM",
        affectedArtifact: "angle-feedback-before-next-action",
        affectedClaims: ["claim-feedback-window"],
      }),
      expect.objectContaining({
        code: "INELIGIBLE_ANGLE_CLAIM",
        affectedArtifact: "angle-monthly-review-limit",
        affectedClaims: ["claim-feedback-window"],
      }),
    ]));
  });

  it("blocks duplicate angle IDs", async () => {
    const graph = await loadValidArtifactGraph();
    graph.videoAngles.candidates[1]!.angleId = graph.videoAngles.candidates[0]!.angleId;

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "DUPLICATE_ANGLE_ID"}),
    ]));
  });

  it("requires exactly one recommended angle", async () => {
    const graph = await loadValidArtifactGraph();
    graph.videoAngles.candidates.forEach((angle) => {
      angle.recommended = false;
    });

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "INVALID_RECOMMENDATION_COUNT"}),
    ]));
  });

  it("requires the recommended angle to be eligible", async () => {
    const graph = await loadValidArtifactGraph();
    graph.videoAngles.candidates.find((angle) => angle.recommended)!.eligible = false;

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "RECOMMENDED_ANGLE_INELIGIBLE"}),
    ]));
  });

  it("requires selected and recommended angle identities to match", async () => {
    const graph = await loadValidArtifactGraph();
    graph.selectedAngle.angleId = "angle-feedback-before-next-action";

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "SELECTED_ANGLE_NOT_RECOMMENDED"}),
    ]));
  });

  it("requires analysis recommendedAngleId to identify the recommended candidate", async () => {
    const graph = await loadValidArtifactGraph();
    graph.analysis.recommendedAngleId = "angle-feedback-before-next-action";

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "ANALYSIS_RECOMMENDED_ANGLE_MISMATCH"}),
    ]));
  });

  it("blocks unknown Claim IDs in synthesis and verification artifacts", async () => {
    const graph = await loadValidArtifactGraph();
    graph.synthesis.claimRelations[0]!.fromClaimId = "claim-missing-synthesis";
    graph.verificationRecords[0]!.claimId = "claim-missing-verification";

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "MISSING_SYNTHESIS_CLAIM"}),
      expect.objectContaining({code: "MISSING_VERIFICATION_CLAIM"}),
    ]));
  });

  it("blocks unknown Claim IDs throughout the unified analysis", async () => {
    const graph = await loadValidArtifactGraph();
    graph.analysis.coreClaimIds = ["claim-missing-core"];
    graph.analysis.verifiedClaimIds = ["claim-missing-verified"];
    graph.analysis.synthesis.claimRelations[0]!.toClaimId = "claim-missing-analysis-synthesis";
    graph.analysis.verificationRecords[0]!.claimId = "claim-missing-analysis-verification";

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "MISSING_ANALYSIS_CORE_CLAIM"}),
      expect.objectContaining({code: "MISSING_ANALYSIS_VERIFIED_CLAIM"}),
      expect.objectContaining({code: "MISSING_ANALYSIS_SYNTHESIS_CLAIM"}),
      expect.objectContaining({code: "MISSING_ANALYSIS_VERIFICATION_CLAIM"}),
    ]));
  });

  it("blocks Claim and Evidence IDs duplicated across chapter artifacts", async () => {
    const graph = await loadValidArtifactGraph();
    graph.chapterAnalyses.push({
      ...structuredClone(graph.chapterAnalyses[0]!),
      chapterId: "chapter-duplicate-ids",
    });

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "DUPLICATE_CLAIM_ID"}),
      expect.objectContaining({code: "DUPLICATE_EVIDENCE_ID"}),
    ]));
  });

  it("blocks a selected angle whose identity is absent from the candidates", async () => {
    const graph = await loadValidArtifactGraph();
    graph.selectedAngle.angleId = "angle-missing";

    expect(validateArtifactGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "MISSING_SELECTED_ANGLE"}),
    ]));
  });

  it("keeps unverified claims and not-verifiable synthetic evidence out of an approved selected angle", async () => {
    const chapter = ChapterAnalysisSchema.parse(await loadBookFixture("sample-chapter-analysis.json"));
    const verification = VerificationRecordSchema.array().parse(
      await loadBookFixture("sample-verification.json"),
    );
    const angles = VideoAnglesSchema.parse(await loadBookFixture("sample-video-angles.json"));
    const selected = SelectedAngleSchema.parse(await loadBookFixture("sample-selected-angle.json"));
    const analysis = BookAnalysisSchema.parse(await loadBookFixture("sample-book-analysis.json"));
    const claimsById = new Map(chapter.claims.map((claim) => [claim.claimId, claim]));
    const evidenceById = new Map(chapter.evidence.map((evidence) => [evidence.evidenceId, evidence]));
    const verdictsByClaimId = new Map(verification.map((record) => [record.claimId, record.verdict]));
    const usableClaim = (claimId: string): boolean => {
      const claim = claimsById.get(claimId);
      return claim?.verificationStatus === "verified" || claim?.verificationStatus === "not_required";
    };
    const recommended = angles.candidates.find((angle) => angle.recommended);

    expect(analysis.status).toBe("approved_for_video");
    expect(analysis.recommendedAngleId).toBe(recommended?.angleId);
    expect(analysis.selectedAngle).toEqual(selected);
    expect(selected.mustInclude.claims.filter((claimId) => !usableClaim(claimId))).toEqual([]);
    expect(recommended?.claimIds.filter((claimId) => !usableClaim(claimId))).toEqual([]);
    expect(selected.mustInclude.evidence.filter((evidenceId) =>
      evidenceById.get(evidenceId)?.supportsClaimIds.some((claimId) => !usableClaim(claimId)),
    )).toEqual([]);
    expect(selected.mustInclude.claims.filter((claimId) =>
      verdictsByClaimId.get(claimId) === "not_verifiable",
    )).toEqual([]);
  });

  it("cross-validates every synthetic fixture reference from source blocks through the selected angle", async () => {
    const source = BookSourceSchema.parse(await loadBookFixture("sample-book-source.json"));
    const chapter = ChapterAnalysisSchema.parse(await loadBookFixture("sample-chapter-analysis.json"));
    const angles = VideoAnglesSchema.parse(await loadBookFixture("sample-video-angles.json"));
    const selected = SelectedAngleSchema.parse(await loadBookFixture("sample-selected-angle.json"));
    const claimIds = new Set(chapter.claims.map((claim) => claim.claimId));
    const evidenceIds = new Set(chapter.evidence.map((evidence) => evidence.evidenceId));

    expect(validateBookSourceRefs(source, [chapter])).toEqual([]);
    expect(validateEvidenceRefs([chapter])).toEqual([]);
    expect(validateAngleRefs(angles, claimIds)).toEqual([]);
    expect(validateSelectedAngleRefs(selected, claimIds, evidenceIds)).toEqual([]);
  });

  it("blocks a claim whose referenced book block does not exist", () => {
    const analysis = chapterAnalysis();
    analysis.claims[0]!.sourceRefs = [
      {type: "book", chapterId: "chapter-practice", page: 2, blockId: "p2-b99"},
    ];

    expect(validateBookSourceRefs(bookSource, [analysis])).toEqual([
      expect.objectContaining({
        code: "MISSING_BOOK_BLOCK",
        severity: "BLOCK",
        affectedArtifact: "chapter-practice",
        affectedClaims: ["claim-focused-practice"],
        blocking: true,
      }),
    ]);
  });

  it("blocks evidence that references an unknown claim", () => {
    const analysis = chapterAnalysis();
    analysis.evidence[0]!.supportsClaimIds = ["claim-missing"];

    expect(validateEvidenceRefs([analysis])).toEqual([
      expect.objectContaining({
        code: "MISSING_EVIDENCE_CLAIM",
        severity: "BLOCK",
        affectedArtifact: "chapter-practice",
        affectedClaims: ["claim-missing"],
        blocking: true,
      }),
    ]);
  });

  it("blocks an angle that references an unknown claim", () => {
    const videoAngles = VideoAnglesSchema.parse({
      candidates: [videoAngle(["claim-missing"])],
    });

    expect(validateAngleRefs(videoAngles, new Set(["claim-focused-practice"]))).toEqual([
      expect.objectContaining({
        code: "MISSING_ANGLE_CLAIM",
        severity: "BLOCK",
        affectedArtifact: "angle-focus",
        affectedClaims: ["claim-missing"],
        blocking: true,
      }),
    ]);
  });

  it("blocks a selected angle that references missing evidence", () => {
    const selectedAngle = {
      angleId: "angle-focus",
      mustInclude: {claims: ["claim-focused-practice"], evidence: ["evidence-missing"]},
    };

    expect(
      validateSelectedAngleRefs(
        selectedAngle,
        new Set(["claim-focused-practice"]),
        new Set(["evidence-practice-study"]),
      ),
    ).toEqual([
      expect.objectContaining({
        code: "MISSING_SELECTED_ANGLE_EVIDENCE",
        severity: "BLOCK",
        affectedArtifact: "angle-focus",
        affectedClaims: [],
        blocking: true,
      }),
    ]);
  });

  it("returns no issues when all source, evidence, and angle references resolve", () => {
    const analysis = chapterAnalysis();
    const videoAngles = VideoAnglesSchema.parse({
      candidates: [videoAngle(["claim-focused-practice"])],
    });
    const selectedAngle = {
      angleId: "angle-focus",
      mustInclude: {claims: ["claim-focused-practice"], evidence: ["evidence-practice-study"]},
    };

    expect(validateBookSourceRefs(bookSource, [analysis])).toEqual([]);
    expect(validateEvidenceRefs([analysis])).toEqual([]);
    expect(validateAngleRefs(videoAngles, new Set(["claim-focused-practice"]))).toEqual([]);
    expect(
      validateSelectedAngleRefs(
        selectedAngle,
        new Set(["claim-focused-practice"]),
        new Set(["evidence-practice-study"]),
      ),
    ).toEqual([]);
  });
});
