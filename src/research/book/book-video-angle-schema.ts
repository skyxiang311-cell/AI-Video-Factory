import {z} from "zod";
import {BookSourceRefSchema} from "./common-schema";

const ScoreSchema = z.number().int().min(0).max(100);
const ClaimIdSchema = z.string().regex(/^claim-[a-z0-9-]+$/);
const EvidenceIdSchema = z.string().regex(/^evidence-[a-z0-9-]+$/);

export const BookVideoAngleTypeSchema = z.enum([
  "counterintuitive",
  "problem_solving",
  "hidden_mechanism",
  "misunderstanding",
  "framework",
  "critical_review",
  "case_driven",
]);

export const BookVideoAngleSchema = z.object({
  angleId: z.string().regex(/^angle-[a-z0-9-]+$/),
  title: z.string().min(1).max(120),
  centralQuestion: z.string().min(1).max(240),
  thesis: z.string().min(1).max(500),
  coreClaimIds: z.array(ClaimIdSchema).min(2).max(8),
  evidenceIds: z.array(EvidenceIdSchema).min(2).max(16),
  sourceRefs: z.array(BookSourceRefSchema).min(2).max(24),
  angleType: BookVideoAngleTypeSchema,
  audienceRelevance: ScoreSchema,
  practicalValue: ScoreSchema,
  counterIntuitiveScore: ScoreSchema,
  evidenceStrength: ScoreSchema,
  narrativePotential: ScoreSchema,
  saveValue: ScoreSchema,
  originalInsight: ScoreSchema,
  titleIntegrityScore: ScoreSchema,
  faithfulnessPenalty: ScoreSchema,
  overclaimPenalty: ScoreSchema,
  evidencePenalty: ScoreSchema,
  overallScore: ScoreSchema,
  eligible: z.boolean(),
  reason: z.string().min(1).max(500),
  risks: z.array(z.string().min(1).max(300)).max(8),
});

export const BookVideoAngleDraftSetSchema = z.object({
  candidates: z.array(BookVideoAngleSchema).min(8).max(12),
});

export const BookVideoAnglesSchema = z.object({
  candidates: z.array(BookVideoAngleSchema).min(3).max(5),
});

export const BookSelectedAngleSchema = BookVideoAngleSchema.extend({
  targetDurationSec: z.literal(300),
});

export type BookVideoAngle = z.infer<typeof BookVideoAngleSchema>;
export type BookVideoAngleDraftSet = z.infer<typeof BookVideoAngleDraftSetSchema>;
export type BookVideoAngles = z.infer<typeof BookVideoAnglesSchema>;
export type BookSelectedAngle = z.infer<typeof BookSelectedAngleSchema>;
