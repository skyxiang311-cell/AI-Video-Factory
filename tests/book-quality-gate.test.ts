import {describe, expect, it} from "vitest";
import {evaluateDeepReadingQuality} from "../src/research/book/quality-gate";

describe("deep reading quality gate", () => {
  it("blocks scores below 75", () => {
    expect(evaluateDeepReadingQuality({score: 74, blockingIssues: []}).status).toBe("blocked");
  });

  it("requires review for scores from 75 through 84", () => {
    expect(evaluateDeepReadingQuality({score: 80, blockingIssues: []}).status).toBe("needs_review");
  });

  it("approves scores of 85 or higher without blocking issues", () => {
    expect(evaluateDeepReadingQuality({score: 88, blockingIssues: []}).status).toBe("approved_for_video");
  });

  it("blocks any score when a blocking issue exists", () => {
    expect(
      evaluateDeepReadingQuality({
        score: 95,
        blockingIssues: ["CORE_CLAIM_MISSING_SOURCE"],
      }).status,
    ).toBe("blocked");
  });
});
