import {z} from "zod";

const ScoreSchema = z.number().min(0).max(100);

export const VideoAngleSchema = z.object({
  angleId: z.string().min(1),
  title: z.string().min(1),
  premise: z.string().min(1),
  eligible: z.boolean(),
  audienceRelevance: ScoreSchema,
  practicalValue: ScoreSchema,
  counterIntuitiveScore: ScoreSchema,
  evidenceStrength: ScoreSchema,
  narrativePotential: ScoreSchema,
  saveValue: ScoreSchema,
  originalInsight: ScoreSchema,
  titleIntegrityScore: ScoreSchema,
  faithfulnessPenalty: ScoreSchema.default(0),
  overclaimPenalty: ScoreSchema.default(0),
  evidencePenalty: ScoreSchema.default(0),
  overallScore: ScoreSchema,
});

export const VideoAnglesSchema = z.object({
  candidates: z.array(VideoAngleSchema),
});

export const SelectedAngleSchema = z.object({
  angleId: z.string().min(1),
  title: z.string().min(1),
  targetDurationSec: z.number().positive(),
  contentBudget: z.object({
    maxClaims: z.number().int().nonnegative(),
    maxExamples: z.number().int().nonnegative(),
    maxConcepts: z.number().int().nonnegative(),
  }),
});

export type VideoAngle = z.infer<typeof VideoAngleSchema>;
export type VideoAngles = z.infer<typeof VideoAnglesSchema>;
export type SelectedAngle = z.infer<typeof SelectedAngleSchema>;
