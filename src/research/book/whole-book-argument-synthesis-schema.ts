import {z} from "zod";
import {ConfidenceSchema} from "./common-schema";
import {ClaimRelationSchema} from "./synthesis-schema";

const ClaimIdSchema = z.string().regex(/^claim-[a-z0-9-]+$/);
const ChapterIdSchema = z.string().regex(/^chapter-[a-z0-9-]+$/);
const NoteSchema = z.string().min(1).max(500);
const ClaimIdsSchema = z.array(ClaimIdSchema).min(1).max(12);

export const SynthesisPerspectiveSchema = z.enum([
  "author_view",
  "system_synthesis",
  "phase3c_critique",
]);

const ThesisSchema = z.object({
  statement: NoteSchema,
  confidence: ConfidenceSchema,
  supportingClaimIds: ClaimIdsSchema,
  perspective: SynthesisPerspectiveSchema,
});

const SourcedSynthesisSchema = z.object({
  statement: NoteSchema,
  perspective: SynthesisPerspectiveSchema,
  supportingClaimIds: ClaimIdsSchema,
});

export const WholeBookArgumentSynthesisSchema = z.object({
  coreThesis: z.array(ThesisSchema).min(1).max(3),
  secondaryTheses: z.array(ThesisSchema).max(8),
  argumentMap: z.array(SourcedSynthesisSchema).min(1).max(12),
  keyConcepts: z.array(z.object({
    concept: z.string().min(1).max(100),
    explanation: NoteSchema,
    supportingClaimIds: ClaimIdsSchema,
  })).min(1).max(16),
  crossChapterPatterns: z.array(z.object({
    statement: NoteSchema,
    chapterIds: z.array(ChapterIdSchema).min(2).max(12),
    supportingClaimIds: ClaimIdsSchema,
  })).min(1).max(10),
  tensions: z.array(SourcedSynthesisSchema).min(1).max(10),
  limitations: z.array(SourcedSynthesisSchema).min(1).max(12),
  practicalFrameworks: z.array(z.object({
    name: z.string().min(1).max(120),
    steps: z.array(z.string().min(1).max(240)).min(1).max(8),
    supportingClaimIds: ClaimIdsSchema,
  })).max(8),
  readerTakeaways: z.array(z.object({
    statement: NoteSchema,
    supportingClaimIds: ClaimIdsSchema,
  })).min(1).max(12),
  relations: z.array(ClaimRelationSchema).min(3).max(40),
});

export type WholeBookArgumentSynthesis = z.infer<typeof WholeBookArgumentSynthesisSchema>;
