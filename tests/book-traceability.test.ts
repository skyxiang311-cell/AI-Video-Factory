import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {
  validateAngleRefs,
  validateBookSourceRefs,
  validateEvidenceRefs,
  validateSelectedAngleRefs,
} from "../src/research/book/traceability";
import {VideoAnglesSchema} from "../src/research/book/angle-schema";
import {BookSourceSchema} from "../src/research/book/source-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {SelectedAngleSchema} from "../src/research/book/angle-schema";

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

describe("book traceability validation", () => {
  it("cross-validates every synthetic fixture reference from source blocks through the selected angle", async () => {
    const source = BookSourceSchema.parse(await loadBookFixture("book-source.json"));
    const chapter = ChapterAnalysisSchema.parse(await loadBookFixture("chapter-analysis.json"));
    const angles = VideoAnglesSchema.parse(await loadBookFixture("video-angles.json"));
    const selected = SelectedAngleSchema.parse(await loadBookFixture("selected-angle.json"));
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
