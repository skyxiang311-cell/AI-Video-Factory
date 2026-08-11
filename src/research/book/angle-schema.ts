import {z} from "zod";

const ScoreSchema = z.number().min(0).max(100);

export const VideoAngleSchema = z.object({
  angleId: z.string().min(1),
  title: z.string().min(1),
  premise: z.string().min(1),
  eligible: z.boolean(),
  claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/)).min(1),
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
  targetDurationSec: z.literal(300),
  centralQuestion: z.string().min(1),
  thesis: z.string().min(1),
  mustInclude: z.object({
    claims: z.array(z.string().min(1)),
    evidence: z.array(z.string().min(1)),
    examples: z.array(z.string().min(1)),
    counterpoints: z.array(z.string().min(1)),
  }),
  optional: z.array(z.string().min(1)),
  exclude: z.array(z.string().min(1)),
  sourceDisplayRequirements: z.array(z.string().min(1)),
  desiredViewerTakeaway: z.string().min(1),
  endingJudgment: z.string().min(1),
  contentBudget: z.object({
    maxClaims: z.number().int().nonnegative(),
    maxExamples: z.number().int().nonnegative(),
    maxConcepts: z.number().int().nonnegative(),
  }),
});

export type VideoAngle = z.infer<typeof VideoAngleSchema>;
export type VideoAngles = z.infer<typeof VideoAnglesSchema>;
export type SelectedAngle = z.infer<typeof SelectedAngleSchema>;
