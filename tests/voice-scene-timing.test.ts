import {describe, expect, it} from "vitest";
import {buildVoiceSceneTimings} from "../src/storyboard/voice-timeline";

describe("buildVoiceSceneTimings", () => {
  it("uses continuous block timings and differentiated pauses", () => {
    const timings = buildVoiceSceneTimings({
      leadInMs: 60,
      tailOutMs: 300,
      audioDurationMs: 4580,
      blocks: [
        {
          durationMs: 1800,
          pauseAfterMs: 620,
          parts: [{
            sceneId: "scene-hook",
            text: "开场口播。",
            speechOffsetMs: 80,
            speechDurationMs: 1500,
            boundaries: [],
          }],
        },
        {
          durationMs: 1800,
          pauseAfterMs: 0,
          parts: [
            {sceneId: "scene-a", text: "第一部分。", speechOffsetMs: 50, speechDurationMs: 700, boundaries: []},
            {sceneId: "scene-b", text: "第二部分。", speechOffsetMs: 900, speechDurationMs: 700, boundaries: []},
          ],
        },
      ],
    });

    expect(timings[0]).toMatchObject({sceneId: "scene-hook", startMs: 0, speechStartMs: 140});
    expect(timings[0]?.endMs).toBe(2480);
    expect(timings[1]?.startMs).toBe(2480);
    expect(timings[1]?.endMs).toBe(3380);
    expect(timings[2]?.startMs).toBe(3380);
    expect(timings[2]?.endMs).toBe(4580);
  });
});
