import type {VoiceBoundary} from "../subtitles/voice-caption-alignment";

export type VoiceSynthesisRequest = {
  segmentId: string;
  text: string;
  audioPath: string;
};

export type VoiceSynthesisResult = VoiceSynthesisRequest & {
  durationMs: number;
  boundaries: VoiceBoundary[];
};

export interface VoiceProvider {
  readonly provider: string;
  synthesize(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult>;
}
