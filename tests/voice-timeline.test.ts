import {describe, expect, it} from "vitest";
import sampleStoryboardJson from "../templates/knowledge/sample-storyboard.json";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";
import {resolveVoiceDrivenStoryboard} from "../src/storyboard/voice-timeline";
import {buildVoiceSceneTimings} from "../src/storyboard/voice-timeline";

describe("resolveVoiceDrivenStoryboard", () => {
  it("derives scene and caption timing from measured voice segments", () => {
    const source = parseVisualStoryboard(sampleStoryboardJson);
    const segmentDurationMs = source.scenes.map((_, index) => 2000 + index * 100);
    const finalAudioDurationMs =
      80 +
      segmentDurationMs.reduce((sum, duration) => sum + duration, 0) +
      (source.scenes.length - 1) * 160 +
      300;

    const resolved = resolveVoiceDrivenStoryboard({
      source,
      audio: {
        src: "voice.mp3",
        provider: "edge-tts",
        voice: "zh-CN-XiaoxiaoNeural",
        rate: "+5%",
        durationMs: finalAudioDurationMs,
        fingerprint: "test-fingerprint",
      },
      segments: source.scenes.map((scene, index) => ({
        sceneId: scene.id,
        durationMs: segmentDurationMs[index]!,
        boundaries: [],
      })),
      leadInMs: 80,
      pauseAfterMs: 160,
      tailOutMs: 300,
    });

    expect(resolved.schemaVersion).toBe("1.2");
    expect(resolved.scenes[0]).toMatchObject({
      startMs: 0,
      speechStartMs: 80,
      speechEndMs: 2080,
    });
    expect(resolved.scenes.at(-1)?.endMs).toBe(finalAudioDurationMs);
    expect(resolved.format.durationMs).toBe(finalAudioDurationMs);
    expect(resolved.captions.every((caption) => caption.endMs <= finalAudioDurationMs)).toBe(true);
  });
});

describe("buildVoiceSceneTimings", () => {
  it("clamps the final speech boundary to the measured assembled audio duration", () => {
    const timings = buildVoiceSceneTimings({
      leadInMs: 0,
      tailOutMs: 0,
      audioDurationMs: 900,
      blocks: [{
        durationMs: 1000,
        pauseAfterMs: 0,
        parts: [{sceneId: "scene-final", text: "结尾", speechOffsetMs: 100, speechDurationMs: 1000, boundaries: []}],
      }],
    });

    expect(timings[0]).toMatchObject({endMs: 900, speechEndMs: 900, speechDurationMs: 800});
  });
});
