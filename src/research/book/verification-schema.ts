import {z} from "zod";
import {ClaimRelationTypeSchema} from "./synthesis-schema";

export const VerificationVerdictSchema = z.enum([
  "supported",
  "partially_supported",
  "uncertain",
  "outdated",
  "contradicted",
  "not_verifiable",
]);

export const ExternalFindingSchema = z.object({
  sourceId: z.string().min(1),
  sourceType: z.string().min(1),
  publicationDate: z.string().min(1),
  finding: z.string().min(1),
  relationToClaim: ClaimRelationTypeSchema,
  credibilityLevel: z.enum(["A", "B", "C", "D"]),
});

export const VerificationRecordSchema = z.object({
  claimId: z.string().regex(/^claim-[a-z0-9-]+$/),
  verdict: VerificationVerdictSchema,
  externalFindings: z.array(ExternalFindingSchema),
});

export type VerificationVerdict = z.infer<typeof VerificationVerdictSchema>;
export type ExternalFinding = z.infer<typeof ExternalFindingSchema>;
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;
