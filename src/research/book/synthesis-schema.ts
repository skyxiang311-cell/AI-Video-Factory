import {z} from "zod";

export const ClaimRelationTypeSchema = z.enum([
  "supports",
  "contradicts",
  "extends",
  "explains",
  "example_of",
  "depends_on",
  "qualifies",
  "repeats",
]);

export const ClaimRelationSchema = z.object({
  fromClaimId: z.string().regex(/^claim-[a-z0-9-]+$/),
  toClaimId: z.string().regex(/^claim-[a-z0-9-]+$/),
  relation: ClaimRelationTypeSchema,
});

export const BookSynthesisSchema = z.object({
  coreThesis: z.string().min(1),
  claimRelations: z.array(ClaimRelationSchema),
});

export type ClaimRelationType = z.infer<typeof ClaimRelationTypeSchema>;
export type ClaimRelation = z.infer<typeof ClaimRelationSchema>;
export type BookSynthesis = z.infer<typeof BookSynthesisSchema>;
