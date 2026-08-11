import {describe, expect, it} from "vitest";
import {sampleStoryboard} from "../src/storyboard/sample";
import {millisecondsToFrames} from "../src/storyboard/timeline";
import {buildVisualTimeline} from "../src/storyboard/visual-timeline";

describe("millisecondsToFrames", () => {
  it("converts exact millisecond boundaries at 30fps", () => {
    expect(millisecondsToFrames(3000, 30)).toBe(90);
    expect(millisecondsToFrames(300, 30)).toBe(9);
  });
});

describe("buildVisualTimeline", () => {
  it("keeps the 30-second sample at exactly 900 frames after transitions", () => {
    const timeline = buildVisualTimeline(sampleStoryboard);

    expect(timeline.durationInFrames).toBe(900);
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
    ).toBe(900);
  });
});
