import {z} from "zod";
import {BookSourceRefSchema} from "./common-schema";

export const DialogueSpeakerSchema = z.enum(["xiaoyuan", "douzai", "narrator"]);
export const DialoguePurposeSchema = z.enum([
  "hook", "question", "answer", "follow_up", "challenge", "explanation", "evidence",
  "phase3c_challenge", "correction", "understanding", "twist", "summary", "transition",
]);
export const DialogueEmotionSchema = z.enum(["neutral", "warm", "curious", "skeptical", "confused", "shocked", "teasing", "serious", "emphatic", "helpless", "happy", "realizing"]);
export const DialoguePoseSchema = z.enum([
  "neutral", "talk", "explain", "point", "happy", "serious", "surprised", "thinking", "facepalm", "stop", "summary",
  "ask", "skeptical", "confused", "shock", "complain", "realize", "embarrassed", "question",
]);
export const DialogueVisualIntentSchema = z.enum([
  "xiaoyuan_closeup", "douzai_closeup", "two_shot", "douzai_reaction", "xiaoyuan_explains",
  "character_data", "character_comparison", "character_diagram", "mini_theater", "both_summary", "info_card",
]);

export const DialogueTurnDraftSchema = z.object({
  id: z.string().regex(/^dialogue-turn-\d{3}$/),
  speaker: DialogueSpeakerSchema,
  text: z.string().min(4).max(120),
  voiceText: z.string().min(4).max(120),
  purpose: DialoguePurposeSchema,
  claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/)).max(6),
  sourceRefs: z.array(BookSourceRefSchema).max(8),
  emotion: DialogueEmotionSchema,
  characterPose: DialoguePoseSchema,
  visualIntent: DialogueVisualIntentSchema,
});

export const DialogueDraftSchema = z.object({
  schemaVersion: z.literal("1.0"),
  title: z.string().min(1).max(120),
  selectedAngleId: z.string().regex(/^angle-[a-z0-9-]+$/),
  centralQuestion: z.string().min(1).max(240),
  targetDurationSec: z.literal(300),
  turns: z.array(DialogueTurnDraftSchema).min(45).max(65),
});

export const DialogueTurnSchema = DialogueTurnDraftSchema.extend({
  startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(),
  speechStartMs: z.number().int().nonnegative(), speechEndMs: z.number().int().positive(),
});

export const DialogueCaptionSchema = z.object({
  turnId: z.string().regex(/^dialogue-turn-\d{3}$/), speaker: DialogueSpeakerSchema,
  text: z.string().min(1), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(),
  timestampMs: z.number().int().nonnegative(), confidence: z.number().nullable(),
  emphasis: z.array(z.unknown()).optional(), tokens: z.array(z.unknown()).optional(), alignmentSource: z.string().optional(),
});

export const DialogueScriptSchema = DialogueDraftSchema.omit({turns: true}).extend({
  durationMs: z.number().int().min(270000).max(330000),
  turns: z.array(DialogueTurnSchema).min(45).max(65),
  captions: z.array(DialogueCaptionSchema).min(45),
  quality: z.object({
    status: z.literal("PASS"), blockingIssues: z.array(z.never()).length(0),
    xiaoyuanTurns: z.number().int(), douzaiTurns: z.number().int(), narratorTurns: z.number().int(),
    narratorDurationShare: z.number().min(0).max(.1), maxXiaoyuanMonologueMs: z.number().max(15000),
    phase3CCritiquePresent: z.literal(true),
  }),
});

export type DialogueDraft = z.infer<typeof DialogueDraftSchema>;
export type DialogueScript = z.infer<typeof DialogueScriptSchema>;
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;
export type DialogueCaption = z.infer<typeof DialogueCaptionSchema>;
