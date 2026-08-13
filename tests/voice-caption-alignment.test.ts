import {describe, expect, it} from "vitest";
import {
  alignSceneCaptions,
  segmentChineseCaptionText,
} from "../src/subtitles/voice-caption-alignment";

describe("segmentChineseCaptionText", () => {
  it("groups Chinese narration into phone-readable caption chunks", () => {
    const chunks = segmentChineseCaptionText(
      "只盯着答案反复看，得到的是熟悉感。合上资料主动回忆，才是在练习真正调用。",
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(
      "只盯着答案反复看，得到的是熟悉感。合上资料主动回忆，才是在练习真正调用。",
    );
    expect(chunks.every((chunk) => Array.from(chunk).length <= 20)).toBe(true);
  });
});

describe("alignSceneCaptions", () => {
  it("maps reliable Edge word boundaries into the real scene audio range", () => {
    const captions = alignSceneCaptions({
      sceneId: "scene-hook",
      text: "学得慢，不一定是记性差。",
      speechStartMs: 100,
      speechEndMs: 2500,
      emphasis: ["不一定"],
      boundaries: [
        {text: "学得慢", offsetMs: 0, durationMs: 650},
        {text: "不一定", offsetMs: 760, durationMs: 620},
        {text: "是记性差", offsetMs: 1450, durationMs: 820},
      ],
    });

    expect(captions).toHaveLength(1);
    expect(captions[0]).toMatchObject({
      startMs: 100,
      endMs: 2370,
      alignmentSource: "edge-word-boundary",
    });
    expect(captions[0]?.emphasis).toEqual([
      {text: "不一定", style: "accent"},
    ]);
  });

  it("falls back to duration weighting when boundaries are unreliable", () => {
    const captions = alignSceneCaptions({
      sceneId: "scene-summary",
      text: "主动回忆，核对缺口，再安排间隔和交错。",
      speechStartMs: 5000,
      speechEndMs: 9000,
      emphasis: ["核对缺口"],
      boundaries: [],
    });

    expect(captions.length).toBeGreaterThan(1);
    expect(captions[0]?.startMs).toBe(5000);
    expect(captions.at(-1)?.endMs).toBe(9000);
    expect(captions.every((caption) => caption.alignmentSource === "duration-weighted-fallback")).toBe(true);
  });

  it("normalizes small Edge boundary overlaps so adjacent captions never overlap", () => {
    const captions = alignSceneCaptions({
      sceneId: "scene-evidence",
      text: "第一段字幕需要清楚，第二段字幕也要清楚。",
      speechStartMs: 100,
      speechEndMs: 2300,
      emphasis: [],
      boundaries: [
        {text: "第一段字幕需要清楚", offsetMs: 0, durationMs: 1050},
        {text: "第二段字幕也要清楚", offsetMs: 1000, durationMs: 1100},
      ],
    });

    expect(captions).toHaveLength(2);
    expect(captions[1]!.startMs).toBeGreaterThanOrEqual(captions[0]!.endMs);
  });
});
