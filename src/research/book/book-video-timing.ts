import {
  resolveVoiceDrivenStoryboardFromTimings,
  type AbsoluteVoiceSceneTiming,
} from "../../storyboard/voice-timeline";
import type {VisualStoryboard} from "../../storyboard/visual-schema";
import {buildVoiceFingerprint, type EdgeVoiceSettings} from "../../voice/edge-tts-adapter";
import {z} from "zod";
import {buildNarrationPlan} from "../../narration/build-narration-plan";

type FinalizeInput = {
  source: VisualStoryboard;
  audio: {
    src: string;
    provider: string;
    voice: string;
    rate: string;
    pitch: string;
    volume: string;
    preset: "natural" | "energetic" | "calm";
    durationMs: number;
    fingerprint: string;
  };
  sceneTimings: AbsoluteVoiceSceneTiming[];
};

const BoundarySchema = z.object({
  text: z.string(),
  offsetMs: z.number().nonnegative(),
  durationMs: z.number().positive(),
});

const VoiceSceneTimingSchema = z.object({
  sceneId: z.string(),
  text: z.string(),
  speechOffsetMs: z.number().nonnegative(),
  speechDurationMs: z.number().positive(),
  boundaries: z.array(BoundarySchema),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  speechStartMs: z.number().nonnegative(),
  speechEndMs: z.number().positive(),
});

const BookVideoVoiceManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  jobId: z.string(),
  provider: z.string().min(1),
  preset: z.literal("natural"),
  voice: z.string().min(1),
  rate: z.string().min(1),
  pitch: z.string().min(1),
  volume: z.string().min(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  durationMs: z.number().int().positive(),
  sceneTimings: z.array(VoiceSceneTimingSchema).min(1),
}).passthrough();

export type BookVideoVoiceManifest = z.infer<typeof BookVideoVoiceManifestSchema>;

export const buildBookVideoVoiceFingerprint = (
  storyboard: VisualStoryboard,
  settings: EdgeVoiceSettings,
): string => buildVoiceFingerprint({
  ...settings,
  texts: [
    "book-video-voice-v2",
    storyboard.jobId,
    storyboard.narration.preset,
    JSON.stringify(storyboard.narration.blocks),
    ...storyboard.scenes.flatMap((scene) => [scene.id, scene.voiceText, JSON.stringify(scene.emphasis)]),
  ],
});

export const parseBookVideoVoiceManifest = (
  storyboard: VisualStoryboard,
  input: unknown,
): BookVideoVoiceManifest => {
  const manifest = BookVideoVoiceManifestSchema.parse(input);
  if (manifest.jobId !== storyboard.jobId) throw new Error("voice manifest jobId 与 Storyboard 不一致");
  const settings = {voice: manifest.voice, rate: manifest.rate, pitch: manifest.pitch, volume: manifest.volume};
  if (manifest.fingerprint !== buildBookVideoVoiceFingerprint(storyboard, settings)) {
    throw new Error("voice manifest fingerprint 已过期");
  }
  const normalizedParts = buildNarrationPlan(storyboard).blocks.flatMap((block) => block.parts);
  if (
    manifest.sceneTimings.length !== normalizedParts.length ||
    manifest.sceneTimings.some((timing, index) =>
      timing.sceneId !== normalizedParts[index]!.sceneId || timing.text !== normalizedParts[index]!.text)
  ) throw new Error("voice manifest 场景顺序或口播文本与 Storyboard 不一致");
  return manifest;
};

export const finalizeBookVideoStoryboard = (input: FinalizeInput): VisualStoryboard => {
  const sceneTimings = input.sceneTimings.map((timing) => {
    const speechEndMs = Math.min(timing.speechEndMs, timing.endMs, input.audio.durationMs);
    return {
      ...timing,
      speechEndMs,
      speechDurationMs: speechEndMs - timing.speechStartMs,
    };
  });
  const primaryHook = sceneTimings[0];
  if (!primaryHook || primaryHook.startMs !== 0 || primaryHook.endMs > 3000) {
    throw new Error("Primary Hook 实际时长必须不超过 3 秒");
  }
  return resolveVoiceDrivenStoryboardFromTimings({...input, sceneTimings});
};
