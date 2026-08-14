import {z} from "zod";
import {BookSourceRefSchema} from "./common-schema";

export const ComicCharacterIdSchema = z.enum(["xiaoyuan", "douzai"]);
export const ComicSpeakerSchema = z.enum(["xiaoyuan", "douzai", "narration"]);
export const ComicPoseSchema = z.enum([
  "normal", "explain", "question", "surprised", "thinking",
  "teasing", "happy", "emphasize", "helpless", "summary",
]);
export const ComicBackgroundSchema = z.enum([
  "knowledge-solid", "living-room", "study-desk", "city", "abstract-diagram", "data-explainer",
]);
export const ComicShotTypeSchema = z.enum([
  "two-person-dialogue", "xiaoyuan-explains", "douzai-reacts", "character-data",
  "character-diagram", "mini-theater", "character-summary",
]);

const CropSchema = z.object({
  x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
  width: z.number().int().positive(), height: z.number().int().positive(),
});

export const ComicCharacterPackSchema = z.object({
  schemaVersion: z.literal("1.0"),
  referenceImage: z.string().min(1),
  referenceSize: z.object({width: z.literal(1672), height: z.literal(941)}),
  characters: z.object({
    xiaoyuan: z.object({
      displayName: z.literal("小圆"), color: z.string(), states: z.array(z.object({
        name: ComicPoseSchema, crop: CropSchema, accessory: z.string(), flip: z.boolean(), treatment: z.string().min(1),
      })).length(10),
    }),
    douzai: z.object({
      displayName: z.literal("豆仔"), color: z.string(), states: z.array(z.object({
        name: ComicPoseSchema, crop: CropSchema, accessory: z.string(), flip: z.boolean(), treatment: z.string().min(1),
      })).length(10),
    }),
  }),
  backgrounds: z.array(ComicBackgroundSchema).length(6),
  components: z.array(z.enum([
    "speech-bubble", "thought-bubble", "emphasis-lines", "arrow", "number-tag",
    "keyword-sticker", "icon-slot", "mini-chart",
  ])).length(8),
});

const ComicTurnSchema = z.object({
  speaker: ComicSpeakerSchema,
  text: z.string().min(1),
  pose: ComicPoseSchema,
  sourceSceneId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
});

export const ComicShotSchema = z.object({
  id: z.string().regex(/^comic-shot-\d{3}$/),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  shotType: ComicShotTypeSchema,
  background: ComicBackgroundSchema,
  turns: z.array(ComicTurnSchema).min(1).max(8),
  claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/)),
  sourceRefs: z.array(BookSourceRefSchema),
  sourceNote: z.string().optional(),
  keyword: z.string().min(1).max(30),
  visualBeats: z.array(z.object({
    atMs: z.number().int().nonnegative(),
    kind: z.enum(["character-enter", "bubble-swap", "keyword-pop", "diagram-draw", "reaction"]),
  })).min(2).max(4),
  originalSceneIds: z.array(z.string().min(1)).min(1),
});

export const BookComicStoryboardSchema = z.object({
  schemaVersion: z.literal("1.0"),
  jobId: z.string().min(1),
  format: z.object({width: z.literal(1080), height: z.literal(1920), fps: z.literal(30), durationMs: z.number().int().min(270_000).max(330_000)}),
  lockedScriptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceStoryboardSha256: z.string().regex(/^[a-f0-9]{64}$/),
  referenceImageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  captionsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  characterPack: ComicCharacterPackSchema,
  audio: z.object({reused: z.literal(true), src: z.literal("voice.mp3"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), durationMs: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/)}),
  captions: z.array(z.object({
    text: z.string(), startMs: z.number(), endMs: z.number(), timestampMs: z.number(), confidence: z.number().nullable(),
    emphasis: z.array(z.unknown()).optional(), tokens: z.array(z.unknown()).optional(), alignmentSource: z.string().optional(), sceneId: z.string().optional(),
  })),
  shots: z.array(ComicShotSchema).min(30).max(45),
});

export type ComicCharacterPack = z.infer<typeof ComicCharacterPackSchema>;
export type BookComicStoryboard = z.infer<typeof BookComicStoryboardSchema>;
export type ComicShot = z.infer<typeof ComicShotSchema>;
