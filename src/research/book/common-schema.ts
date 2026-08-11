import {z} from "zod";

export const ConfidenceSchema = z.number().min(0).max(1);

export const BookSourceRefSchema = z.object({
  type: z.literal("book"),
  chapterId: z.string().regex(/^chapter-[a-z0-9-]+$/),
  page: z.number().int().positive(),
  blockId: z.string().regex(/^p\d+-[a-z0-9-]+$/),
});

export const ExternalSourceRefSchema = z.object({
  type: z.literal("external"),
  sourceId: z.string().regex(/^ext-[a-z0-9-]+$/),
});

export const SourceRefSchema = z.discriminatedUnion("type", [
  BookSourceRefSchema,
  ExternalSourceRefSchema,
]);

export const ArtifactMetaSchema = z.object({
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  promptVersion: z.string().min(1),
  modelProfile: z.string().min(1),
  schemaVersion: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type BookSourceRef = z.infer<typeof BookSourceRefSchema>;
export type ExternalSourceRef = z.infer<typeof ExternalSourceRefSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type ArtifactMeta = z.infer<typeof ArtifactMetaSchema>;
