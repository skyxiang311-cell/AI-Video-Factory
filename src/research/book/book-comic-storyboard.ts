import type {VisualScene, VisualStoryboard} from "../../storyboard/visual-schema";
import {
  BookComicStoryboardSchema,
  ComicCharacterPackSchema,
  type BookComicStoryboard,
  type ComicCharacterPack,
  type ComicShot,
} from "./comic-storyboard-schema";
import type {BookSourceRef} from "./common-schema";

const poses = ["normal", "explain", "question", "surprised", "thinking", "teasing", "happy", "emphasize", "helpless", "summary"] as const;

export const buildDefaultComicCharacterPack = (referenceImage: string): ComicCharacterPack => {
  const xiaoyuanCrops = [
    {x: 20, y: 95, width: 300, height: 720},
    {x: 360, y: 125, width: 150, height: 185},
    {x: 360, y: 365, width: 150, height: 175},
  ];
  const douzaiCrops = [
    {x: 560, y: 100, width: 220, height: 760},
    {x: 790, y: 145, width: 140, height: 160},
    {x: 790, y: 390, width: 140, height: 155},
  ];
  const accessories = ["none", "sparkles", "question-mark", "shock-lines", "thought-cloud", "sweat-drop", "hearts", "impact-lines", "ellipsis", "star"];
  const treatments = ["steady", "lean-forward", "tilt", "zoom", "soft-bob", "side-eye", "celebrate", "pulse", "droop", "hero"];
  return ComicCharacterPackSchema.parse({
    schemaVersion: "1.0",
    referenceImage,
    referenceSize: {width: 1672, height: 941},
    characters: {
      xiaoyuan: {
        displayName: "小圆", color: "#ef5d78",
        states: poses.map((name, index) => ({name, crop: xiaoyuanCrops[index === 0 ? 0 : index % 3 === 1 ? 1 : 2]!, accessory: accessories[index]!, flip: index === 5, treatment: treatments[index]!})),
      },
      douzai: {
        displayName: "豆仔", color: "#3168bd",
        states: poses.map((name, index) => ({name, crop: douzaiCrops[index === 0 ? 0 : index % 3 === 1 ? 1 : 2]!, accessory: accessories[index]!, flip: index === 7, treatment: treatments[index]!})),
      },
    },
    backgrounds: ["knowledge-solid", "living-room", "study-desk", "city", "abstract-diagram", "data-explainer"],
    components: ["speech-bubble", "thought-bubble", "emphasis-lines", "arrow", "number-tag", "keyword-sticker", "icon-slot", "mini-chart"],
  });
};

const unique = <T>(values: T[]): T[] => [...new Set(values)];
const refKey = (ref: BookSourceRef) => `${ref.chapterId}:${ref.page}:${ref.blockId}`;
const uniqueRefs = (refs: BookSourceRef[]): BookSourceRef[] => [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];

type ComicSceneGroup = {startMs: number; endMs: number; scenes: VisualScene[]};

const groupScenes = (scenes: VisualScene[], durationMs: number): ComicSceneGroup[] => {
  const shotCount = Math.max(30, Math.min(45, Math.round(durationMs / 7000)));
  const groups = Array.from({length: shotCount}, (_, index): ComicSceneGroup => ({
    startMs: Math.round(index * durationMs / shotCount),
    endMs: Math.round((index + 1) * durationMs / shotCount),
    scenes: [],
  }));
  for (const group of groups) group.scenes = scenes.filter((scene) => scene.endMs > group.startMs && scene.startMs < group.endMs);
  return groups.filter((group) => group.scenes.length > 0);
};

const speakerFor = (scene: VisualScene, sceneIndex: number): "xiaoyuan" | "douzai" | "narration" => {
  if (sceneIndex === 0) return "douzai";
  if (sceneIndex === 1) return "xiaoyuan";
  if (scene.purpose === "context" && sceneIndex % 3 === 0) return "douzai";
  if (scene.purpose === "knowledge" && sceneIndex % 7 === 0) return "douzai";
  if (scene.purpose === "knowledge" && sceneIndex % 11 === 0) return "narration";
  return "xiaoyuan";
};

const poseFor = (speaker: "xiaoyuan" | "douzai" | "narration", scene: VisualScene, sceneIndex: number) => {
  if (speaker === "narration") return "normal" as const;
  if (scene.purpose === "hook") return speaker === "douzai" ? "question" as const : "emphasize" as const;
  if (scene.purpose === "summary") return "summary" as const;
  if (speaker === "douzai") return (["question", "surprised", "thinking", "teasing", "happy"] as const)[sceneIndex % 5]!;
  return (["explain", "emphasize", "thinking", "happy", "helpless"] as const)[sceneIndex % 5]!;
};

const shotTypeFor = (scenes: VisualScene[], index: number): ComicShot["shotType"] => {
  if (index === 0) return "two-person-dialogue";
  if (scenes.some((scene) => scene.purpose === "summary")) return "character-summary";
  if (scenes.some((scene) => scene.visualType === "stat" || /\d/u.test(scene.voiceText))) return "character-data";
  if (scenes.some((scene) => scene.visualType === "comparison")) return "two-person-dialogue";
  if (index % 7 === 0) return "mini-theater";
  if (index % 5 === 0) return "douzai-reacts";
  return index % 2 === 0 ? "character-diagram" : "xiaoyuan-explains";
};

const backgrounds = ["knowledge-solid", "living-room", "study-desk", "city", "abstract-diagram", "data-explainer"] as const;

const visualBeatsFor = (durationMs: number): ComicShot["visualBeats"] => {
  const count = durationMs >= 6500 ? 4 : 3;
  const kinds = ["character-enter", "bubble-swap", "keyword-pop", "diagram-draw"] as const;
  return Array.from({length: count}, (_, index) => ({
    atMs: Math.round(index * Math.max(1, durationMs - 500) / (count - 1)),
    kind: kinds[index]!,
  }));
};

export const buildBookComicStoryboard = (input: {
  jobId: string;
  source: VisualStoryboard;
  lockedScriptSha256: string;
  sourceStoryboardSha256: string;
  referenceImageSha256: string;
  captionsSha256: string;
  audio: {fingerprint: string; durationMs: number; sha256: string};
  characterPack: ComicCharacterPack;
}): BookComicStoryboard => {
  const sceneIndices = new Map(input.source.scenes.map((scene, index) => [scene.id, index]));
  const groups = groupScenes(input.source.scenes, input.source.format.durationMs);
  const shots = groups.map((group, shotIndex): ComicShot => {
    const {scenes} = group;
    const turns = scenes.map((scene) => {
      const sceneIndex = sceneIndices.get(scene.id) ?? 0;
      const speaker = speakerFor(scene, sceneIndex);
      return {speaker, text: scene.voiceText, pose: poseFor(speaker, scene, sceneIndex), sourceSceneId: scene.id, startMs: scene.startMs, endMs: scene.endMs};
    });
    if (shotIndex === 0 && !turns.some((turn) => turn.speaker === "xiaoyuan")) {
      const secondTurn = turns[1];
      if (secondTurn) turns[1] = {...secondTurn, speaker: "xiaoyuan", pose: "emphasize"};
    }
    const {startMs, endMs} = group;
    const sourceNotes = scenes.map((scene) => scene.sourceNote).filter((value): value is string => Boolean(value));
    return {
      id: `comic-shot-${String(shotIndex + 1).padStart(3, "0")}`,
      startMs, endMs,
      shotType: shotTypeFor(scenes, shotIndex),
      background: backgrounds[shotIndex % backgrounds.length]!,
      turns,
      claimIds: unique(scenes.flatMap((scene) => scene.claimIds)),
      sourceRefs: uniqueRefs(scenes.flatMap((scene) => scene.sourceRefs).filter((ref): ref is BookSourceRef => Boolean(ref))),
      sourceNote: sourceNotes[0],
      keyword: Array.from(scenes.flatMap((scene) => scene.onScreenText)[0] ?? turns[0]!.text).slice(0, 28).join(""),
      visualBeats: visualBeatsFor(endMs - startMs),
      originalSceneIds: scenes.map((scene) => scene.id),
    };
  });
  return BookComicStoryboardSchema.parse({
    schemaVersion: "1.0",
    jobId: input.jobId,
    format: {width: 1080, height: 1920, fps: 30, durationMs: input.source.format.durationMs},
    lockedScriptSha256: input.lockedScriptSha256,
    sourceStoryboardSha256: input.sourceStoryboardSha256,
    referenceImageSha256: input.referenceImageSha256,
    captionsSha256: input.captionsSha256,
    characterPack: input.characterPack,
    audio: {reused: true, src: "voice.mp3", ...input.audio},
    captions: input.source.captions,
    shots,
  });
};
