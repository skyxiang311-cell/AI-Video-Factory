import {describe, expect, it} from "vitest";
import {
  DEFAULT_VOICE_PRESET,
  getVoicePreset,
  VOICE_PRESETS,
} from "../src/voice/voice-presets";

describe("voice presets", () => {
  it("provides natural, energetic and calm presets", () => {
    expect(Object.keys(VOICE_PRESETS)).toEqual(["natural", "energetic", "calm"]);
    expect(getVoicePreset("natural").rate).toBe("+7%");
    expect(getVoicePreset("energetic").rate).toBe("+13%");
    expect(getVoicePreset("calm").rate).toBe("-2%");
  });

  it("uses natural by default", () => {
    expect(DEFAULT_VOICE_PRESET).toBe("natural");
  });
});
