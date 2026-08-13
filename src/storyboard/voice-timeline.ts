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

export type NarrationScenePartTiming = {
  sceneId: string;
  text: string;
  speechOffsetMs: number;
  speechDurationMs: number;
  boundaries: VoiceBoundary[];
};

export type AbsoluteVoiceSceneTiming = NarrationScenePartTiming & {
  startMs: number;
  endMs: number;
  speechStartMs: number;
  speechEndMs: number;
};

export const buildVoiceSceneTimings = (input: {
  leadInMs: number;
  tailOutMs: number;
  audioDurationMs: number;
  blocks: Array<{
    durationMs: number;
    pauseAfterMs: number;
    parts: NarrationScenePartTiming[];
  }>;
}): AbsoluteVoiceSceneTiming[] => {
  let blockAudioStartMs = input.leadInMs;
  let sceneStartMs = 0;
  const results: AbsoluteVoiceSceneTiming[] = [];

  input.blocks.forEach((block, blockIndex) => {
    block.parts.forEach((part, partIndex) => {
      const nextPart = block.parts[partIndex + 1];
      const isFinalScene =
        blockIndex === input.blocks.length - 1 &&
        partIndex === block.parts.length - 1;
      const endMs = isFinalScene
        ? input.audioDurationMs
        : nextPart
          ? blockAudioStartMs + nextPart.speechOffsetMs
          : blockAudioStartMs + block.durationMs + block.pauseAfterMs;
      const speechStartMs = blockAudioStartMs + part.speechOffsetMs;
      const speechEndMs = Math.min(
        endMs,
        speechStartMs + part.speechDurationMs,
      );
      results.push({
        ...part,
        speechDurationMs: speechEndMs - speechStartMs,
        startMs: sceneStartMs,
        endMs,
        speechStartMs,
        speechEndMs,
      });
      sceneStartMs = endMs;
    });
    blockAudioStartMs += block.durationMs + block.pauseAfterMs;
  });
  return results;
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

type ResolveVoiceDrivenStoryboardFromTimingsInput = {
  source: VisualStoryboard;
  audio: ResolveVoiceDrivenStoryboardInput["audio"] & {
    pitch: string;
    volume: string;
    preset: "natural" | "energetic" | "calm";
  };
  sceneTimings: AbsoluteVoiceSceneTiming[];
};

export const resolveVoiceDrivenStoryboardFromTimings = ({
  source,
  audio,
  sceneTimings,
}: ResolveVoiceDrivenStoryboardFromTimingsInput): VisualStoryboard => {
  if (sceneTimings.length !== source.scenes.length) {
    throw new Error("配音场景时间数量必须与 Storyboard 场景一致");
  }
  const captions: VisualStoryboard["captions"] = [];
  const scenes = source.scenes.map((scene, index) => {
    const timing = sceneTimings[index]!;
    if (timing.sceneId !== scene.id) {
      throw new Error(`配音场景顺序不匹配：期望 ${scene.id}，收到 ${timing.sceneId}`);
    }
    captions.push(...alignSceneCaptions({
      sceneId: scene.id,
      text: timing.text,
      speechStartMs: timing.speechStartMs,
      speechEndMs: timing.speechEndMs,
      emphasis: scene.emphasis,
      boundaries: timing.boundaries,
    }));
    return {
      ...scene,
      startMs: timing.startMs,
      endMs: timing.endMs,
      speechStartMs: timing.speechStartMs,
      speechEndMs: timing.speechEndMs,
    };
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
