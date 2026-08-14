import {describe, expect, it} from "vitest";
import {
  assignBoundariesToParts,
  calculateTrimWindow,
} from "../src/voice/voice-segment-processing";

describe("calculateTrimWindow", () => {
  it("removes provider edge silence while keeping safe padding", () => {
    const window = calculateTrimWindow({
      durationMs: 2800,
      boundaries: [
        {text: "很多人", offsetMs: 100, durationMs: 500},
        {text: "记住了", offsetMs: 1800, durationMs: 420},
      ],
    });

    expect(window).toEqual({startMs: 40, endMs: 2310});
    expect(window.endMs).toBeLessThan(2800);
  });
});

describe("assignBoundariesToParts", () => {
  it("maps one continuous semantic block back to its storyboard scenes", () => {
    const assignments = assignBoundariesToParts(
      [
        {sceneId: "scene-a", text: "很多人会反复看。"},
        {sceneId: "scene-b", text: "但眼熟不等于记住。"},
      ],
      [
        {text: "很多人", offsetMs: 50, durationMs: 300},
        {text: "会反复看", offsetMs: 400, durationMs: 500},
        {text: "但眼熟", offsetMs: 1050, durationMs: 350},
        {text: "不等于记住", offsetMs: 1450, durationMs: 600},
      ],
    );

    expect(assignments.map((part) => part.sceneId)).toEqual(["scene-a", "scene-b"]);
    expect(assignments[0]?.boundaries.map((boundary) => boundary.text)).toEqual(["很多人", "会反复看"]);
    expect(assignments[1]?.boundaries[0]?.offsetMs).toBe(0);
    expect(assignments[1]?.speechOffsetMs).toBe(1050);
    expect(assignments.every((part) => part.mappingSource === "boundary-text-match")).toBe(true);
  });

  it("anchors mismatched text to the provider's real boundary timing", () => {
    const assignments = assignBoundariesToParts(
      [
        {sceneId: "scene-a", text: "比例是百分之八十。"},
        {sceneId: "scene-b", text: "继续练习。"},
      ],
      [
        {text: "eighty percent", offsetMs: 100, durationMs: 900},
        {text: "continue", offsetMs: 1200, durationMs: 700},
      ],
    );

    expect(assignments.every((part) => part.mappingSource === "boundary-anchored-fallback")).toBe(true);
    expect(assignments.every((part) => part.boundaries.length === 1)).toBe(true);
    expect(assignments.at(-1)!.speechOffsetMs + assignments.at(-1)!.speechDurationMs).toBe(1900);
  });

  it("falls back instead of dropping a final micro-scene when Edge returns coarse boundaries", () => {
    const assignments = assignBoundariesToParts(
      [
        {sceneId: "scene-a", text: "作者先提出判断，"},
        {sceneId: "scene-b", text: "接着说明证据，"},
        {sceneId: "scene-c", text: "最后保留边界。"},
      ],
      [
        {text: "作者先提出判断接着说明证据", offsetMs: 100, durationMs: 1600},
        {text: "最后保留边界", offsetMs: 1800, durationMs: 900},
      ],
    );

    expect(assignments).toHaveLength(3);
    expect(assignments.every((part) => part.mappingSource === "boundary-anchored-fallback")).toBe(true);
    expect(assignments.at(-1)!.speechOffsetMs + assignments.at(-1)!.speechDurationMs).toBe(2700);
  });
});
