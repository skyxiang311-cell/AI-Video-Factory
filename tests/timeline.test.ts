import {describe, expect, it} from "vitest";
import {sampleStoryboard} from "../src/storyboard/sample";
import {parseStoryboard} from "../src/storyboard/schema";
import {buildTimeline, millisecondsToFrames} from "../src/storyboard/timeline";

describe("millisecondsToFrames", () => {
  it("converts exact millisecond boundaries at 30fps", () => {
    expect(millisecondsToFrames(3000, 30)).toBe(90);
    expect(millisecondsToFrames(300, 30)).toBe(9);
  });
});

describe("buildTimeline", () => {
  it("keeps the 24-second sample at exactly 720 frames after transitions", () => {
    const timeline = buildTimeline(sampleStoryboard);

    expect(timeline.durationInFrames).toBe(720);
    expect(timeline.items[0]).toMatchObject({
      logicalFromFrame: 0,
      logicalDurationInFrames: 90,
      transitionDurationInFrames: 9,
      sequenceDurationInFrames: 99,
    });
    expect(
      timeline.items.reduce(
        (sum, item) => sum + item.sequenceDurationInFrames,
        0,
      ) -
        timeline.items.reduce(
          (sum, item) => sum + item.transitionDurationInFrames,
          0,
        ),
    ).toBe(720);
  });

  it("derives durations from rounded absolute boundaries without cumulative drift", () => {
    const storyboard = parseStoryboard({
      schemaVersion: "1.0",
      jobId: "rounding-demo",
      format: {width: 1080, height: 1920, fps: 30, durationMs: 82},
      template: "knowledge",
      scenes: [
        {
          id: "scene-hook",
          startMs: 0,
          endMs: 17,
          purpose: "hook",
          voiceText: "钩子",
          onScreenText: ["钩子"],
          visualIntent: "测试绝对帧边界",
          assetRefs: [],
          emphasis: ["钩子"],
          contentFlags: [],
          transition: "cut",
          transitionDurationMs: 0,
          presentation: {variant: "hook", accentColor: "#ffffff"},
        },
        {
          id: "scene-summary",
          startMs: 17,
          endMs: 82,
          purpose: "summary",
          voiceText: "总结",
          onScreenText: ["总结"],
          visualIntent: "测试绝对帧边界",
          assetRefs: [],
          emphasis: ["总结"],
          contentFlags: [],
          transition: "cut",
          transitionDurationMs: 0,
          presentation: {variant: "summary-card", accentColor: "#ffffff"},
        },
      ],
      captions: [
        {
          text: "测试",
          startMs: 0,
          endMs: 82,
          timestampMs: null,
          confidence: null,
        },
      ],
    });

    const timeline = buildTimeline(storyboard);

    expect(timeline.items[0]?.logicalDurationInFrames).toBe(1);
    expect(timeline.items[1]?.logicalFromFrame).toBe(1);
    expect(timeline.items[1]?.logicalDurationInFrames).toBe(1);
    expect(timeline.durationInFrames).toBe(2);
  });
});
