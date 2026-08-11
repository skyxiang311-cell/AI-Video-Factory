import {describe, expect, it} from "vitest";
import {
  validateAngleRefs,
  validateBookSourceRefs,
  validateEvidenceRefs,
  validateSelectedAngleRefs,
} from "../src/research/book/traceability";

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

describe("book traceability validation", () => {
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
    const videoAngles = {
      candidates: [{angleId: "angle-focus", claimIds: ["claim-missing"]}],
    };

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
    const videoAngles = {
      candidates: [{angleId: "angle-focus", claimIds: ["claim-focused-practice"]}],
    };
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
