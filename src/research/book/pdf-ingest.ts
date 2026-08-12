import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {basename, extname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import type {TextItem} from "pdfjs-dist/types/src/display/api.d.ts";
import {BookSourceSchema, type BookSource} from "./source-schema";

type DetectedLanguage = "zh-CN" | "ja" | "en" | "und";

interface ExtractedLine {
  page: number;
  text: string;
  bbox: [number, number, number, number];
}

interface ChapterBoundary {
  title: string;
  startPage: number;
}

const CHAPTER_HEADING = /^(?:chapter\s+(?:\d+|[ivxlcdm]+)\b|第[一二三四五六七八九十百千万零〇0-9]+章\b)/iu;
const LIST_PREFIX = /^(?:[-*•]|\d+[.)])\s+/u;
const TOC_MARKER = /^(?:contents|table of contents|目录|目次)$/iu;
const STANDARD_FONT_DATA_URL = fileURLToPath(
  new URL("../../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
);

const roundCoordinate = (value: number): number => Math.round(value * 1_000) / 1_000;

const isTextItem = (item: unknown): item is TextItem => (
  typeof item === "object"
  && item !== null
  && "str" in item
  && typeof item.str === "string"
  && "transform" in item
  && Array.isArray(item.transform)
);

const normalizeExtractedText = (text: string): string => text.replace(/\s+/gu, " ").trim();

export const detectBookTextLanguage = (text: string): DetectedLanguage => {
  if (/[\u3040-\u30ff]/u.test(text)) return "ja";
  if (/\p{Script=Han}/u.test(text)) return "zh-CN";
  if (/\p{Script=Latin}/u.test(text)) return "en";
  return "und";
};

const extractPageLines = async (
  document: PDFDocumentProxy,
  pageNumber: number,
): Promise<ExtractedLine[]> => {
  const page = await document.getPage(pageNumber);
  const textContent = await page.getTextContent({disableNormalization: false});
  const items = textContent.items
    .filter(isTextItem)
    .map((item) => ({
      text: normalizeExtractedText(item.str),
      x: Number(item.transform[4] ?? 0),
      y: Number(item.transform[5] ?? 0),
      width: Math.abs(item.width),
      height: Math.abs(item.height || Number(item.transform[3] ?? 0)),
    }))
    .filter((item) => item.text.length > 0)
    .sort((left, right) => {
      const verticalDifference = right.y - left.y;
      return Math.abs(verticalDifference) > 1 ? verticalDifference : left.x - right.x;
    });

  const lines: Array<{
    textParts: string[];
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }> = [];

  for (const item of items) {
    const line = lines.find((candidate) => Math.abs(candidate.y1 - item.y) <= 2);
    const itemX2 = item.x + item.width;
    const itemY2 = item.y + item.height;
    if (line) {
      line.textParts.push(item.text);
      line.x1 = Math.min(line.x1, item.x);
      line.y1 = Math.min(line.y1, item.y);
      line.x2 = Math.max(line.x2, itemX2);
      line.y2 = Math.max(line.y2, itemY2);
    } else {
      lines.push({
        textParts: [item.text],
        x1: item.x,
        y1: item.y,
        x2: itemX2,
        y2: itemY2,
      });
    }
  }

  return lines.map((line) => ({
    page: pageNumber,
    text: normalizeExtractedText(line.textParts.join(" ")),
    bbox: [
      roundCoordinate(line.x1),
      roundCoordinate(line.y1),
      roundCoordinate(line.x2 - line.x1),
      roundCoordinate(line.y2 - line.y1),
    ],
  }));
};

const resolveOutlinePage = async (
  document: PDFDocumentProxy,
  destination: string | unknown[] | null,
): Promise<number | null> => {
  const resolved = typeof destination === "string"
    ? await document.getDestination(destination)
    : destination;
  const pageReference = resolved?.[0];
  if (typeof pageReference === "number") return pageReference + 1;
  if (!pageReference || typeof pageReference !== "object") return null;

  try {
    return (await document.getPageIndex(pageReference as {num: number; gen: number})) + 1;
  } catch {
    return null;
  }
};

const findChapterBoundaries = async (
  document: PDFDocumentProxy,
  lines: ExtractedLine[],
): Promise<{boundaries: ChapterBoundary[]; source: "outline" | "headings" | "fallback"}> => {
  const outline = await document.getOutline();
  const outlined: ChapterBoundary[] = [];
  for (const item of outline ?? []) {
    const page = await resolveOutlinePage(document, item.dest);
    const title = normalizeExtractedText(item.title);
    if (page !== null && page >= 1 && page <= document.numPages && title) {
      outlined.push({title, startPage: page});
    }
  }

  const uniqueOutlined = outlined
    .sort((left, right) => left.startPage - right.startPage)
    .filter((boundary, index, entries) => index === 0 || entries[index - 1]?.startPage !== boundary.startPage);
  if (uniqueOutlined.length > 0) return {boundaries: uniqueOutlined, source: "outline"};

  const headings = lines
    .filter((line) => CHAPTER_HEADING.test(line.text))
    .map((line) => ({title: line.text, startPage: line.page}))
    .filter((boundary, index, entries) => index === 0 || entries[index - 1]?.startPage !== boundary.startPage);
  if (headings.length > 0) return {boundaries: headings, source: "headings"};

  return {boundaries: [], source: "fallback"};
};

const metadataString = (info: Record<string, unknown>, key: string): string | undefined => {
  const value = info[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const toMetadataRecord = (value: object): Record<string, unknown> => value as Record<string, unknown>;

export const ingestDigitalPdf = async (
  pdfPath: string,
  options: {createdAt?: string} = {},
): Promise<BookSource> => {
  const absolutePath = resolve(pdfPath);
  const bytes = await readFile(absolutePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useWorkerFetch: false,
  });

  try {
    const document = await loadingTask.promise;
    const pageLines: ExtractedLine[][] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      pageLines.push(await extractPageLines(document, pageNumber));
    }

    const allLines = pageLines.flat();
    if (allLines.length === 0) {
      throw new Error("Phase 2A supports digital PDFs with a usable text layer only; OCR is not enabled");
    }
    const {info} = await document.getMetadata();
    const metadata = toMetadataRecord(info);
    const fallbackTitle = basename(absolutePath, extname(absolutePath));
    const title = metadataString(metadata, "Title") ?? fallbackTitle;
    const author = metadataString(metadata, "Author");
    const warnings: string[] = [];
    if (!author) warnings.push("PDF author metadata was unavailable; using Unknown");

    const detectedLanguages = Array.from(new Set(
      allLines
        .map((line) => detectBookTextLanguage(line.text))
        .filter((language): language is Exclude<DetectedLanguage, "und"> => language !== "und"),
    ));
    const dominantLanguage: DetectedLanguage = detectedLanguages[0] ?? "und";
    const chapterDetection = await findChapterBoundaries(document, allLines);
    let boundaries = chapterDetection.boundaries;

    if (boundaries.length === 0) {
      boundaries = [{title, startPage: 1}];
      warnings.push("No reliable chapter boundaries were detected; using one fallback container for the full document");
    } else if (boundaries[0]?.startPage !== 1) {
      boundaries.unshift({title: "Front Matter", startPage: 1});
      warnings.push("Pages before the first detected chapter use a neutral front-matter container");
    }

    const chapters = boundaries.map((boundary, index) => ({
      chapterId: index === 0 && boundary.title === "Front Matter"
        ? "chapter-front-matter"
        : `chapter-${String(index + 1).padStart(3, "0")}`,
      title: boundary.title,
      startPage: boundary.startPage,
      endPage: (boundaries[index + 1]?.startPage ?? document.numPages + 1) - 1,
    }));

    const pages = pageLines.map((lines, pageIndex) => {
      const pageNumber = pageIndex + 1;
      if (lines.length === 0) warnings.push(`PDF page ${pageNumber} contains no extractable electronic text`);
      const chapter = chapters.find((candidate) => (
        pageNumber >= candidate.startPage && pageNumber <= candidate.endPage
      ));
      if (!chapter) throw new Error(`No chapter container covers PDF page ${pageNumber}`);

      return {
        page: pageNumber,
        contentBlocks: lines.map((line, blockIndex) => ({
          blockId: `p${pageNumber}-b${blockIndex + 1}`,
          page: pageNumber,
          chapterId: chapter.chapterId,
          type: CHAPTER_HEADING.test(line.text)
            ? "heading" as const
            : LIST_PREFIX.test(line.text)
              ? "list" as const
              : "paragraph" as const,
          originalText: line.text,
          language: detectBookTextLanguage(line.text) === "und"
            ? dominantLanguage
            : detectBookTextLanguage(line.text),
          bbox: line.bbox,
          confidence: 0.99,
        })),
        visualElements: [],
      };
    });

    const tocPage = allLines.find((line) => TOC_MARKER.test(line.text))?.page;
    if (tocPage !== undefined && chapterDetection.source !== "outline") {
      warnings.push(`Table-of-contents marker detected on page ${tocPage}; entries were not used without reliable destinations`);
    }

    return BookSourceSchema.parse({
      artifact: {
        inputHash: sha256,
        promptVersion: "book-source-digital-pdf-v1",
        modelProfile: "deterministic-pdfjs",
        schemaVersion: "1.0.0",
        createdAt: options.createdAt ?? new Date().toISOString(),
      },
      metadata: {
        title,
        authors: [author ?? "Unknown"],
        language: dominantLanguage,
        pageCount: document.numPages,
      },
      document: {
        pdfKind: "digital",
        sourcePath: absolutePath,
        sha256,
        detectedLanguages: detectedLanguages.length > 0 ? detectedLanguages : ["und"],
      },
      structure: {
        frontMatter: chapters[0]?.chapterId === "chapter-front-matter"
          ? {startPage: 1, endPage: chapters[0].endPage}
          : null,
        chapters,
        conclusion: null,
        appendices: [],
      },
      pages,
      extractionQuality: {
        overallConfidence: 0.99,
        lowConfidencePages: [],
        warnings,
      },
    });
  } finally {
    await loadingTask.destroy();
  }
};
