import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {BookSynthesisSchema} from "../src/research/book/synthesis-schema";
import {VerificationRecordSchema} from "../src/research/book/verification-schema";

const loadBookFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(new URL(`../templates/book-deep-reading/${name}`, import.meta.url), "utf8"),
);

const validSynthesis = () => ({
  coreThesis: "Focused practice works because feedback turns effort into correction.",
  claimRelations: [
    {
      fromClaimId: "claim-feedback",
      toClaimId: "claim-focused-practice",
      relation: "supports",
    },
  ],
});

const validVerificationRecord = () => ({
  claimId: "claim-focused-practice",
  verificationPriority: 90,
  reason: "The central claim will be used in the selected video angle.",
  verdict: "partially_supported",
  analysis: "The external result supports the claim within the studied population.",
  confidence: 0.9,
  externalFindings: [
    {
      sourceId: "ext-practice-study",
      sourceType: "study",
      publicationDate: "2024-03-15",
      finding: "The study found improved retention for the tested practice group.",
      relationToClaim: "supports",
      credibilityLevel: "A",
    },
  ],
});

describe("book synthesis and verification schemas", () => {
  it("parses synthetic synthesis and verification without presenting synthetic findings as research", async () => {
    const synthesis = BookSynthesisSchema.parse(await loadBookFixture("sample-book-synthesis.json"));
    const verification = VerificationRecordSchema.array().parse(await loadBookFixture("sample-verification.json"));

    expect(synthesis.claimRelations).toHaveLength(1);
    expect(verification).toHaveLength(1);
    expect(verification[0]?.analysis).toMatch(/synthetic/i);
    expect(verification[0]?.externalFindings[0]?.finding).toMatch(/synthetic/i);
  });

  it("parses the core thesis and each supported claim relation", () => {
    const synthesis = BookSynthesisSchema.parse(validSynthesis());

    expect(synthesis.claimRelations[0]).toMatchObject({
      fromClaimId: "claim-feedback",
      toClaimId: "claim-focused-practice",
      relation: "supports",
    });
  });

  it("rejects a claim relation outside the defined relation set", () => {
    const synthesis = validSynthesis();
    synthesis.claimRelations[0]!.relation = "causes";

    expect(BookSynthesisSchema.safeParse(synthesis).success).toBe(false);
  });

  it("keeps external verification findings separate from the author claim", () => {
    const record = VerificationRecordSchema.parse(validVerificationRecord());

    expect(record).toMatchObject({
      claimId: "claim-focused-practice",
      verificationPriority: 90,
      verdict: "partially_supported",
      reason: "The central claim will be used in the selected video angle.",
      analysis: "The external result supports the claim within the studied population.",
      confidence: 0.9,
      externalFindings: [
        {
          sourceId: "ext-practice-study",
          credibilityLevel: "A",
        },
      ],
    });
  });

  it("rejects an external finding without its required source and credibility fields", () => {
    const record = validVerificationRecord();
    delete (record.externalFindings[0] as Partial<(typeof record.externalFindings)[number]>).sourceId;

    expect(VerificationRecordSchema.safeParse(record).success).toBe(false);
  });

  it("rejects a verdict outside the defined verification set", () => {
    const record = validVerificationRecord();
    record.verdict = "true";

    expect(VerificationRecordSchema.safeParse(record).success).toBe(false);
  });

  it("requires a reasoned, prioritized verdict with bounded confidence", () => {
    const record = validVerificationRecord();
    record.confidence = 1.01;

    expect(VerificationRecordSchema.safeParse(record).success).toBe(false);
  });
});
