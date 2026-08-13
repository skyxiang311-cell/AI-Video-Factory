import {z} from "zod";

const ScoreSchema = z.number().int().min(0).max(100);
const ClaimIdSchema = z.string().regex(/^claim-[a-z0-9-]+$/);
const CodeSchema = z.string().regex(/^[A-Z0-9_]+$/);

export const AuditFindingSchema = z.object({
  code: CodeSchema,
  artifact: z.string().min(1).max(240),
  claimIds: z.array(ClaimIdSchema).max(20),
  message: z.string().min(1).max(800),
});

export const AuditRepairSchema = z.object({
  code: CodeSchema,
  artifact: z.string().min(1).max(240),
  claimIds: z.array(ClaimIdSchema).max(20),
  action: z.string().min(1).max(800),
});

export const IndependentAuditDraftSchema = z.object({
  coverageScore: ScoreSchema,
  thesisScore: ScoreSchema,
  evidenceScore: ScoreSchema,
  scopeScore: ScoreSchema,
  causalityScore: ScoreSchema,
  synthesisScore: ScoreSchema,
  traceabilityScore: ScoreSchema,
  blockingIssues: z.array(AuditFindingSchema).max(30),
  warnings: z.array(AuditFindingSchema).max(40),
  strengths: z.array(AuditFindingSchema).max(30),
  requiredRepairs: z.array(AuditRepairSchema).max(30),
});

export const IndependentAuditSchema = IndependentAuditDraftSchema.extend({
  overallScore: ScoreSchema,
  status: z.enum(["PASS", "NEEDS_REVIEW", "BLOCKED"]),
  videoReady: z.boolean(),
});

export type AuditFinding = z.infer<typeof AuditFindingSchema>;
export type AuditRepair = z.infer<typeof AuditRepairSchema>;
export type IndependentAuditDraft = z.infer<typeof IndependentAuditDraftSchema>;
export type IndependentAudit = z.infer<typeof IndependentAuditSchema>;
