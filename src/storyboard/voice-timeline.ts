import {parseVisualStoryboard, type VisualStoryboard} from "./visual-schema";
import {
  alignSceneCaptions,
  type VoiceBoundary,
} from "../subtitles/voice-caption-alignment";

export type VoiceSegmentTiming = {
  sceneId: string;
  durationMs: number;
  boundaries: VoiceBoundary[];
};

type ResolveVoiceDrivenStoryboardInput = {
  source: VisualStoryboard;
  audio: {
    src: string;
    provider: string;
    voice: string;
    rate: string;
    durationMs: number;
    fingerprint: string;
  };
  segments: VoiceSegmentTiming[];
  leadInMs: number;
  pauseAfterMs: number;
  tailOutMs: number;
};

export const resolveVoiceDrivenStoryboard = ({
  source,
  audio,
  segments,
  leadInMs,
  pauseAfterMs,
  tailOutMs,
}: ResolveVoiceDrivenStoryboardInput): VisualStoryboard => {
  if (segments.length !== source.scenes.length) {
    throw new Error("配音片段数量必须与场景数量一致");
  }

  let cursor = 0;
  const captions: VisualStoryboard["captions"] = [];
  const scenes = source.scenes.map((scene, index) => {
    const segment = segments[index]!;
    if (segment.sceneId !== scene.id) {
      throw new Error(`配音片段顺序不匹配：期望 ${scene.id}，收到 ${segment.sceneId}`);
    }
    const startMs = cursor;
    const speechStartMs = startMs + (index === 0 ? leadInMs : 0);
    const speechEndMs = speechStartMs + segment.durationMs;
    const isLast = index === source.scenes.length - 1;
    const calculatedEndMs = speechEndMs + (isLast ? tailOutMs : pauseAfterMs);
    const endMs = isLast ? audio.durationMs : calculatedEndMs;
    if (endMs < speechEndMs) {
      throw new Error(`最终音频短于场景口播：${scene.id}`);
    }
    captions.push(
      ...alignSceneCaptions({
        sceneId: scene.id,
        text: scene.voiceText,
        speechStartMs,
        speechEndMs,
        emphasis: scene.emphasis,
        boundaries: segment.boundaries,
      }),
    );
    cursor = endMs;
    return {...scene, startMs, endMs, speechStartMs, speechEndMs};
  });

  return parseVisualStoryboard({
    ...source,
    schemaVersion: "1.2",
    format: {...source.format, durationMs: audio.durationMs},
    audio: {enabled: true, ...audio},
    scenes,
    captions,
  });
};
