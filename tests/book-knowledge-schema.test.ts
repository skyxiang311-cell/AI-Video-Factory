import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {
  ChapterAnalysisSchema,
  ClaimSchema,
  EvidenceSchema,
} from "../src/research/book/knowledge-schema";

const loadBookFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const validClaim = () => ({
  claimId: "claim-focus-beats-volume",
  type: "causal",
  statement: "Focused practice improves retention more than sheer volume.",
  importance: {score: 70, level: "high", reason: "Supports the chapter's central argument."},
  authorPosition: "The author presents this as the book's conclusion.",
  scope: {
    appliesTo: ["deliberate practice"],
    doesNotNecessarilyApplyTo: ["all forms of repetition"],
  },
  bookEvidenceRefs: [
    {type: "book", chapterId: "chapter-practice", page: 12, blockId: "p12-b1"},
  ],
  sourceRefs: [
    {type: "book", chapterId: "chapter-practice", page: 12, blockId: "p12-b1"},
  ],
  confidence: 0.92,
  verificationStatus: "not_required",
});

const validEvidence = () => ({
  evidenceId: "evidence-practice-study",
  type: "study",
  summary: "A controlled study compared focused and unfocused practice.",
  supportsClaimIds: ["claim-focus-beats-volume"],
  strength: 0.84,
  sourceRef: {type: "book", chapterId: "chapter-practice", page: 12, blockId: "p12-b1"},
  originalExcerpt: "Focused practice produced higher retention.",
  interpretation: "The study supports the claim within its stated population.",
  confidence: 0.9,
});

const validChapterAnalysis = () => ({
  chapterId: "chapter-practice",
  title: "Focused practice",
  importance: {score: 85, level: "core", reason: "Contains a core argument."},
  chapterRole: "core_argument",
  summary: {
    oneSentence: "Focused practice is more effective than repetition alone.",
    detailed: "The chapter explains the conditions under which focused practice improves retention.",
  },
  claims: [validClaim()],
  arguments: [],
  evidence: [validEvidence()],
  examples: [],
  concepts: [],
  questions: [],
  limitations: [],
  relationsToOtherChapters: [],
  quality: {confidence: 0.9},
});

describe("book knowledge schemas", () => {
  it("parses the synthetic chapter analysis with two scoped traceable claims and evidence items", async () => {
    const chapter = ChapterAnalysisSchema.parse(await loadBookFixture("sample-chapter-analysis.json"));

    expect(chapter.claims).toHaveLength(2);
    expect(chapter.evidence).toHaveLength(2);
    expect(chapter.claims.every((claim) => claim.scope.appliesTo.length > 0)).toBe(true);
    expect(chapter.claims.every((claim) => claim.sourceRefs.length > 0)).toBe(true);
  });

  it("parses a scoped claim with traceable source references", () => {
    const claim = ClaimSchema.parse(validClaim());

    expect(claim.scope).toEqual({
      appliesTo: ["deliberate practice"],
      doesNotNecessarilyApplyTo: ["all forms of repetition"],
    });
  });

  it("rejects a high-importance claim without source references", () => {
    const claim = validClaim();
    claim.importance.score = 80;
    claim.sourceRefs = [];

    expect(ClaimSchema.safeParse(claim).success).toBe(false);
  });

  it("rejects a claim with empty scope boundaries", () => {
    const claim = validClaim();
    claim.scope.appliesTo = [];
    claim.scope.doesNotNecessarilyApplyTo = [];

    expect(ClaimSchema.safeParse(claim).success).toBe(false);
  });

  it("rejects a claim without book evidence references", () => {
    const claim = validClaim();
    claim.bookEvidenceRefs = [];

    expect(ClaimSchema.safeParse(claim).success).toBe(false);
  });

  it("parses evidence that links to a claim and book source", () => {
    const evidence = EvidenceSchema.parse(validEvidence());

    expect(evidence.supportsClaimIds).toEqual(["claim-focus-beats-volume"]);
  });

  it("rejects duplicate claim ids within a chapter analysis", () => {
    const chapter = validChapterAnalysis();
    chapter.claims.push(validClaim());

    expect(ChapterAnalysisSchema.safeParse(chapter).success).toBe(false);
  });

  it("rejects duplicate evidence ids within a chapter analysis", () => {
    const chapter = validChapterAnalysis();
    chapter.evidence.push(validEvidence());

    expect(ChapterAnalysisSchema.safeParse(chapter).success).toBe(false);
  });
});
