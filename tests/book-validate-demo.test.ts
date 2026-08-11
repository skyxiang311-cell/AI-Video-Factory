import {describe, expect, it} from "vitest";
import {validateBookContractDemo} from "../scripts/book-validate-demo";

describe("book contract validation demo", () => {
  it("validates the locked Book Deep Reading fixtures for video", async () => {
    const result = await validateBookContractDemo();

    expect(result.deepReadingStatus).toBe("approved_for_video");
    expect(result.traceabilityIssues).toEqual([]);
    expect(result.selectedAngle.targetDurationSec).toBe(300);
    expect(result.storyboardProfile.name).toBe("book-deep-reading");
  });
});
