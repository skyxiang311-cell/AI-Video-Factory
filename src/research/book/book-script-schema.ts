import {z} from "zod";
import {BookSourceRefSchema} from "./common-schema";

const ClaimIdSchema = z.string().regex(/^claim-[a-z0-9-]+$/);
const purposeValues = [
  "primary_hook",
  "hook_extension",
  "audience_relevance",
  "author_core_judgment",
  "strongest_evidence",
  "second_layer_mechanism",
  "critical_turn",
  "system_judgment",
  "memorable_ending",
] as const;

export const BookScriptPurposeSchema = z.enum(purposeValues);
export const BookScriptSegmentSchema = z.object({
  text: z.string().min(1),
  voiceText: z.string().min(1),
  purpose: BookScriptPurposeSchema,
  startSec: z.number().int().min(0),
  endSec: z.number().int().positive(),
  claimIds: z.array(ClaimIdSchema).max(8),
  sourceRefs: z.array(BookSourceRefSchema).max(16),
  visibleSourceRequired: z.boolean(),
});

export const BookScriptQualityComponentsSchema = z.object({
  hook: z.number().int().min(0).max(10),
  centralQuestion: z.number().int().min(0).max(10),
  narrativeCoherence: z.number().int().min(0).max(15),
  evidence: z.number().int().min(0).max(15),
  depth: z.number().int().min(0).max(15),
  criticalThinking: z.number().int().min(0).max(10),
  practicalValue: z.number().int().min(0).max(10),
  spokenChinese: z.number().int().min(0).max(10),
  ending: z.number().int().min(0).max(5),
});

export const BookScriptDraftSchema = z.object({
  title: z.string().min(1).max(120),
  selectedAngleId: z.string().regex(/^angle-[a-z0-9-]+$/),
  centralQuestion: z.string().min(1).max(240),
  targetDurationSec: z.literal(300),
  segments: z.array(BookScriptSegmentSchema).length(9),
  quality: BookScriptQualityComponentsSchema,
});

export const BookDeepScriptSchema = BookScriptDraftSchema.extend({
  durationSec: z.number().int().min(270).max(330),
  quality: BookScriptQualityComponentsSchema.extend({
    overallScore: z.number().int().min(0).max(100),
    blockingIssues: z.array(z.string().min(1)),
    status: z.enum(["PASS", "BLOCKED"]),
  }),
});

export type BookScriptDraft = z.infer<typeof BookScriptDraftSchema>;
export type BookDeepScript = z.infer<typeof BookDeepScriptSchema>;
