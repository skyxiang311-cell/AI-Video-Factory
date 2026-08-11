import {describe, expect, it} from "vitest";
import {getStoryboardProfile} from "../src/storyboard/profile";

describe("storyboard profiles", () => {
  it("keeps the current short-video hard limit", () => {
    expect(getStoryboardProfile("knowledge-short")).toEqual({
      name: "knowledge-short",
      hardMaxDurationMs: 180_000,
      targetMinDurationMs: 60_000,
      targetMaxDurationMs: 180_000,
      primaryHookMaxMs: 3_000,
    });
  });

  it("allows Book Deep Reading to reach six minutes", () => {
    expect(getStoryboardProfile("book-deep-reading")).toEqual({
      name: "book-deep-reading",
      hardMaxDurationMs: 360_000,
      targetMinDurationMs: 270_000,
      targetMaxDurationMs: 330_000,
      primaryHookMaxMs: 3_000,
    });
  });
});
