import type {EdgeVoiceSettings} from "./edge-tts-adapter";

export const VOICE_PRESETS = {
  natural: {
    voice: "zh-CN-XiaoxiaoNeural",
    rate: "+7%",
    pitch: "+0Hz",
    volume: "+0%",
  },
  energetic: {
    voice: "zh-CN-XiaoxiaoNeural",
    rate: "+13%",
    pitch: "+2Hz",
    volume: "+0%",
  },
  calm: {
    voice: "zh-CN-XiaoxiaoNeural",
    rate: "-2%",
    pitch: "-2Hz",
    volume: "-1%",
  },
} as const satisfies Record<string, EdgeVoiceSettings>;

export type VoicePresetName = keyof typeof VOICE_PRESETS;
export const DEFAULT_VOICE_PRESET: VoicePresetName = "natural";

export const getVoicePreset = (name: VoicePresetName): EdgeVoiceSettings => ({
  ...VOICE_PRESETS[name],
});
