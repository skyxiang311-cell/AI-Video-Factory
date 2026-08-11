import {z} from "zod";
import {ArtifactMetaSchema, ConfidenceSchema} from "./common-schema";

const PageNumberSchema = z.number().int().positive();

const PageRangeSchema = z.object({
  startPage: PageNumberSchema,
  endPage: PageNumberSchema,
});

const ChapterSchema = PageRangeSchema.extend({
  chapterId: z.string().regex(/^chapter-[a-z0-9-]+$/),
  title: z.string().min(1),
});

const ContentBlockSchema = z.object({
  blockId: z.string().regex(/^p\d+-[a-z0-9-]+$/),
  page: PageNumberSchema,
  chapterId: z.string().regex(/^chapter-[a-z0-9-]+$/),
  type: z.enum(["paragraph", "heading", "list", "table", "footnote", "caption", "quote"]),
  originalText: z.string().min(1),
  language: z.string().min(1),
  translation: z.object({"zh-CN": z.string().min(1)}).optional(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  confidence: ConfidenceSchema,
});

const VisualElementSchema = z.object({
  elementId: z.string().regex(/^p\d+-v[a-z0-9-]+$/),
  type: z.enum(["image", "chart", "table", "diagram", "formula", "other"]),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  description: z.string().min(1),
  confidence: ConfidenceSchema,
});

const PageSchema = z.object({
  page: PageNumberSchema,
  contentBlocks: z.array(ContentBlockSchema),
  visualElements: z.array(VisualElementSchema),
});

const LowConfidencePageSchema = z.object({
  page: PageNumberSchema,
  confidence: ConfidenceSchema,
  reason: z.string().min(1).optional(),
});

export const BookSourceSchema = z.object({
  artifact: ArtifactMetaSchema,
  metadata: z.object({
    title: z.string().min(1),
    authors: z.array(z.string().min(1)).min(1),
    language: z.string().min(1),
    publisher: z.string().min(1).optional(),
    publicationYear: z.number().int().positive().optional(),
    pageCount: PageNumberSchema,
  }),
  document: z.object({
    pdfKind: z.enum(["digital", "scanned", "mixed"]),
    sourcePath: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    detectedLanguages: z.array(z.string().min(1)).min(1),
  }),
  structure: z.object({
    frontMatter: PageRangeSchema.nullable(),
    chapters: z.array(ChapterSchema),
    conclusion: PageRangeSchema.nullable(),
    appendices: z.array(PageRangeSchema),
  }),
  pages: z.array(PageSchema),
  extractionQuality: z.object({
    overallConfidence: ConfidenceSchema,
    lowConfidencePages: z.array(LowConfidencePageSchema),
    warnings: z.array(z.string().min(1)),
  }),
}).superRefine((source, context) => {
  const {pageCount} = source.metadata;
  const ensurePageBound = (page: number, path: (string | number)[]): void => {
    if (page > pageCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `Page must be within 1..${pageCount}`,
      });
    }
  };
  const ensureRange = (
    range: {startPage: number; endPage: number},
    path: (string | number)[],
  ): void => {
    ensurePageBound(range.startPage, [...path, "startPage"]);
    ensurePageBound(range.endPage, [...path, "endPage"]);
    if (range.endPage < range.startPage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "endPage"],
        message: "End page must not be before start page",
      });
    }
  };

  if (source.structure.frontMatter) ensureRange(source.structure.frontMatter, ["structure", "frontMatter"]);
  if (source.structure.conclusion) ensureRange(source.structure.conclusion, ["structure", "conclusion"]);
  source.structure.appendices.forEach((appendix, index) => ensureRange(appendix, ["structure", "appendices", index]));

  let previousEndPage = 0;
  source.structure.chapters.forEach((chapter, index) => {
    const path = ["structure", "chapters", index] as (string | number)[];
    ensureRange(chapter, path);
    if (chapter.startPage <= previousEndPage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "startPage"],
        message: "Chapter ranges must be ordered without overlap",
      });
    }
    previousEndPage = Math.max(previousEndPage, chapter.endPage);
  });

  const pageNumbers = new Set<number>();
  source.pages.forEach((page, pageIndex) => {
    const pagePath = ["pages", pageIndex, "page"] as (string | number)[];
    ensurePageBound(page.page, pagePath);
    if (pageNumbers.has(page.page)) {
      context.addIssue({code: z.ZodIssueCode.custom, path: pagePath, message: "Pages must be unique"});
    }
    pageNumbers.add(page.page);

    page.contentBlocks.forEach((block, blockIndex) => {
      const path = ["pages", pageIndex, "contentBlocks", blockIndex] as (string | number)[];
      ensurePageBound(block.page, [...path, "page"]);
      if (block.page !== page.page) {
        context.addIssue({code: z.ZodIssueCode.custom, path: [...path, "page"], message: "Block page must match its containing page"});
      }
      if (!block.blockId.startsWith(`p${page.page}-`)) {
        context.addIssue({code: z.ZodIssueCode.custom, path: [...path, "blockId"], message: "Block id must use its page prefix"});
      }
    });

    page.visualElements.forEach((element, elementIndex) => {
      if (!element.elementId.startsWith(`p${page.page}-`)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pages", pageIndex, "visualElements", elementIndex, "elementId"],
          message: "Visual element id must use its page prefix",
        });
      }
    });
  });

  source.extractionQuality.lowConfidencePages.forEach((entry, index) => {
    ensurePageBound(entry.page, ["extractionQuality", "lowConfidencePages", index, "page"]);
    if (!pageNumbers.has(entry.page)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["extractionQuality", "lowConfidencePages", index, "page"],
        message: "Low-confidence pages must reference an extracted page",
      });
    }
  });
});

export type BookSource = z.infer<typeof BookSourceSchema>;
