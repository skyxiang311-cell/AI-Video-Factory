import type {VisualStoryboard} from "../storyboard/visual-schema";
import {normalizeSpeechText, type NormalizedSpeech} from "./normalize-speech";
import {resolvePauseMs, type PauseKind} from "./pause-policy";
import type {VoicePresetName} from "../voice/voice-presets";

export type NarrationPart = NormalizedSpeech & {sceneId: string};
export type NarrationBlock = {
  id: string;
  parts: NarrationPart[];
  text: string;
  pauseAfter: PauseKind;
  pauseAfterMs: number;
};
export type NarrationPlan = {preset: VoicePresetName; blocks: NarrationBlock[]};

export const buildNarrationPlan = (storyboard: VisualStoryboard): NarrationPlan => {
  const sceneById = new Map(storyboard.scenes.map((scene) => [scene.id, scene]));
  const seen = new Set<string>();
  const blocks = storyboard.narration.blocks.map((block) => {
    const parts = block.sceneIds.map((sceneId): NarrationPart => {
      const scene = sceneById.get(sceneId);
      if (!scene) throw new Error(`Narration 引用了不存在的场景：${sceneId}`);
      if (seen.has(sceneId)) throw new Error(`Narration 重复引用场景：${sceneId}`);
      seen.add(sceneId);
      return {
        sceneId,
        ...normalizeSpeechText(scene.voiceText, {protectedTerms: scene.emphasis}),
      };
    });
    return {
      id: block.id,
      parts,
      text: parts.map((part) => part.text).join(""),
      pauseAfter: block.pauseAfter,
      pauseAfterMs: resolvePauseMs(block.pauseAfter),
    };
  });
  if (seen.size !== storyboard.scenes.length) {
    const missing = storyboard.scenes.filter((scene) => !seen.has(scene.id)).map((scene) => scene.id);
    throw new Error(`Narration 未覆盖全部场景：${missing.join(", ")}`);
  }
  return {preset: storyboard.narration.preset, blocks};
};
