import {describe, expect, it} from "vitest";
import {
  buildVoiceFingerprint,
  ticksToMilliseconds,
} from "../src/voice/edge-tts-adapter";

describe("Edge TTS adapter helpers", () => {
  it("converts 100ns speech ticks to milliseconds", () => {
    expect(ticksToMilliseconds(10_000)).toBe(1);
    expect(ticksToMilliseconds(12_345_678)).toBe(1235);
  });

  it("creates a stable fingerprint from narration and voice settings", () => {
    const first = buildVoiceFingerprint({
      voice: "zh-CN-XiaoxiaoNeural",
      rate: "+5%",
      pitch: "+0Hz",
      volume: "+0%",
      texts: ["第一幕", "第二幕"],
    });
    const second = buildVoiceFingerprint({
      voice: "zh-CN-XiaoxiaoNeural",
      rate: "+5%",
      pitch: "+0Hz",
      volume: "+0%",
      texts: ["第一幕", "第二幕"],
    });

    expect(second).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
