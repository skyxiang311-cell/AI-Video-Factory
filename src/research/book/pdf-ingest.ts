import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {basename, extname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import type {TextItem} from "pdfjs-dist/types/src/display/api.d.ts";
import {createLocalOcrEngine, type LocalOcrEngine, type OcrLine} from "./local-ocr";
import {renderPdfPageForOcr, type RenderedPdfPage} from "./pdf-page-render";
import {
  extractAndPersistPdfPageVisuals,
  type ExtractedPdfVisualElement,
  type VisualClassificationLine,
} from "./pdf-visual-extract";
import {BookSourceSchema, type BookSource} from "./source-schema";

type DetectedLanguage = "zh-CN" | "ja" | "en" | "und";

export interface ExtractedLine {
  page: number;
  text: string;
  bbox: [number, number, number, number];
  confidence?: number;
}

interface ChapterBoundary {
  title: string;
  startPage: number;
}

export interface ChineseChapterBoundary extends ChapterBoundary {
  chapterNumber: number;
}

const CHINESE_CHAPTER_PREFIX = /^(第([一二三四五六七八九十百千万零〇0-9]+)章)(.*)$/u;
const CHAPTER_HEADING = /^(?:chapter\s+(?:\d+|[ivxlcdm]+)\b|第[一二三四五六七八九十百千万零〇0-9]+章)/iu;
const LIST_PREFIX = /^(?:[-*•]|\d+[.)])\s+/u;
const TOC_MARKER = /^(?:contents|table of contents|目录|目次)$/iu;
const TOC_LEADER = /(?:\.{2,}|…{2,}|·{2,})/u;
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

const CHINESE_DIGITS = new Map<string, number>([
  ["零", 0], ["〇", 0], ["一", 1], ["二", 2], ["三", 3], ["四", 4],
  ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9],
]);
const CHINESE_UNITS = new Map<string, number>([["十", 10], ["百", 100], ["千", 1_000]]);

const parseChineseChapterNumber = (value: string): number | null => {
  if (/^\d+$/u.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return parsed > 0 ? parsed : null;
  }

  let total = 0;
  let currentDigit = 0;
  for (const character of value) {
    const digit = CHINESE_DIGITS.get(character);
    if (digit !== undefined) {
      currentDigit = digit;
      continue;
    }
    const unit = CHINESE_UNITS.get(character);
    if (unit === undefined) return null;
    total += (currentDigit || 1) * unit;
    currentDigit = 0;
  }
  const parsed = total + currentDigit;
  return parsed > 0 ? parsed : null;
};

const parseChineseChapterPrefix = (text: string): {
  marker: string;
  chapterNumber: number;
  suffix: string;
} | null => {
  const match = CHINESE_CHAPTER_PREFIX.exec(normalizeExtractedText(text));
  if (!match) return null;
  const chapterNumber = parseChineseChapterNumber(match[2] ?? "");
  if (chapterNumber === null) return null;
  return {
    marker: match[1] ?? "",
    chapterNumber,
    suffix: normalizeExtractedText(match[3] ?? ""),
  };
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

const stripTocLeader = (text: string): string => normalizeExtractedText(
  text.split(TOC_LEADER, 1)[0] ?? "",
).replace(/\s+\d+\s*$/u, "").trim();

const comparableChapterTitle = (text: string): string => normalizeExtractedText(text)
  .replace(/[^\p{L}\p{N}]/gu, "");

export const detectChineseChapterBoundaries = (
  lines: ExtractedLine[],
): ChineseChapterBoundary[] => {
  const pageMedianHeights = new Map<number, number>();
  for (const page of new Set(lines.map((line) => line.page))) {
    pageMedianHeights.set(page, median(
      lines.filter((line) => line.page === page).map((line) => line.bbox[3]),
    ));
  }
  const isProminent = (line: ExtractedLine): boolean => {
    const pageMedian = pageMedianHeights.get(line.page) ?? 0;
    return line.bbox[3] >= 12 || line.bbox[3] >= pageMedian * 1.25;
  };

  const tocMarkerIndex = lines.findIndex((line) => TOC_MARKER.test(line.text));
  const firstConfirmedIndex = lines.findIndex((line, index) => (
    index > tocMarkerIndex
    && parseChineseChapterPrefix(line.text) !== null
    && isProminent(line)
  ));
  const tocEndIndex = firstConfirmedIndex === -1 ? lines.length : firstConfirmedIndex;
  const tocTitles = new Map<number, string>();

  if (tocMarkerIndex !== -1) {
    for (let index = tocMarkerIndex + 1; index < tocEndIndex; index += 1) {
      const line = lines[index]!;
      const parsed = parseChineseChapterPrefix(line.text);
      if (!parsed || isProminent(line)) continue;
      const currentHasLeader = TOC_LEADER.test(line.text);
      const next = lines[index + 1];
      const nextContinues = !currentHasLeader
        && next !== undefined
        && next.page === line.page
        && parseChineseChapterPrefix(next.text) === null
        && TOC_LEADER.test(next.text);
      if (!currentHasLeader && !nextContinues) continue;

      const titleParts = [stripTocLeader(parsed.suffix)].filter(Boolean);
      if (nextContinues && next) titleParts.push(stripTocLeader(next.text));
      if (titleParts.length > 0) tocTitles.set(parsed.chapterNumber, titleParts.join(" "));
    }
  }

  const detected = new Map<number, ChineseChapterBoundary>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const parsed = parseChineseChapterPrefix(line.text);
    if (!parsed || detected.has(parsed.chapterNumber)) continue;
    if (tocMarkerIndex !== -1 && index < tocEndIndex) continue;

    const titleParts = [parsed.suffix].filter(Boolean);
    let previous = line;
    for (let offset = 1; offset <= 2; offset += 1) {
      const continuation = lines[index + offset];
      if (!continuation || continuation.page !== line.page) break;
      if (parseChineseChapterPrefix(continuation.text)) break;
      const verticalGap = previous.bbox[1] - continuation.bbox[1];
      if (
        continuation.bbox[3] < Math.max(10, line.bbox[3] * 0.75)
        || verticalGap <= 0
        || verticalGap > Math.max(30, line.bbox[3] * 2.25)
      ) break;
      titleParts.push(normalizeExtractedText(continuation.text));
      previous = continuation;
    }

    const extractedTitle = titleParts.join(" ");
    const tocTitle = tocTitles.get(parsed.chapterNumber);
    const matchesTocTitle = tocTitle !== undefined
      && comparableChapterTitle(extractedTitle) === comparableChapterTitle(tocTitle);
    if (!isProminent(line) && !matchesTocTitle) continue;

    const title = tocTitle ?? extractedTitle;
    if (!title) continue;
    detected.set(parsed.chapterNumber, {
      chapterNumber: parsed.chapterNumber,
      title: `${parsed.marker} ${title}`,
      startPage: line.page,
    });
  }

  return Array.from(detected.values()).sort((left, right) => left.startPage - right.startPage);
};

export const isReliableNativeText = (lines: ExtractedLine[]): boolean => {
  const text = lines.map((line) => line.text).join("");
  const characters = Array.from(text);
  const meaningfulCharacters = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  const invalidCharacters = text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/gu)?.length ?? 0;

  return meaningfulCharacters >= 4
    && invalidCharacters / Math.max(1, characters.length) <= 0.1;
};

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
    confidence: 0.99,
  }));
};

const extractVisualClassificationLines = async (
  document: PDFDocumentProxy,
  pageNumber: number,
): Promise<VisualClassificationLine[]> => {
  const page = await document.getPage(pageNumber);
  const textContent = await page.getTextContent({disableNormalization: false});

  return textContent.items
    .filter(isTextItem)
    .map((item) => ({
      text: normalizeExtractedText(item.str),
      bbox: [
        roundCoordinate(Number(item.transform[4] ?? 0)),
        roundCoordinate(Number(item.transform[5] ?? 0)),
        roundCoordinate(Math.abs(item.width)),
        roundCoordinate(Math.abs(item.height || Number(item.transform[3] ?? 0))),
      ] as [number, number, number, number],
    }))
    .filter((line) => line.text.length > 0);
};

const mapOcrLineToPdf = (
  line: OcrLine,
  pageNumber: number,
  rendered: RenderedPdfPage,
): ExtractedLine => {
  const [x, y, width, height] = line.bbox;
  const xScale = rendered.pdfWidth / rendered.width;
  const yScale = rendered.pdfHeight / rendered.height;

  return {
    page: pageNumber,
    text: normalizeExtractedText(line.text),
    confidence: line.confidence,
    bbox: [
      roundCoordinate(x * xScale),
      roundCoordinate(rendered.pdfHeight - ((y + height) * yScale)),
      roundCoordinate(width * xScale),
      roundCoordinate(height * yScale),
    ],
  };
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
  const chineseHeadings = detectChineseChapterBoundaries(lines);
  if (chineseHeadings.length > 0) return {boundaries: chineseHeadings, source: "headings"};

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
  options: {createdAt?: string; visualsDirectory?: string} = {},
): Promise<BookSource> => {
  const absolutePath = resolve(pdfPath);
  const bytes = await readFile(absolutePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useWorkerFetch: false,
  });
  let ocrEngine: LocalOcrEngine | undefined;

  try {
    const document = await loadingTask.promise;
    const pageLines: ExtractedLine[][] = [];
    const pageVisualElements: ExtractedPdfVisualElement[][] = [];
    const pageConfidences: number[] = [];
    const ocrPages = new Set<number>();
    const lowConfidencePages: Array<{
      page: number;
      confidence: number;
      reason: string;
    }> = [];
    const warnings: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const nativeLines = await extractPageLines(document, pageNumber);
      if (isReliableNativeText(nativeLines)) {
        pageLines.push(nativeLines);
        pageConfidences.push(0.99);
        pageVisualElements.push(options.visualsDirectory
          ? await extractAndPersistPdfPageVisuals({
              page: await document.getPage(pageNumber),
              pageNumber,
              textLines: await extractVisualClassificationLines(document, pageNumber),
              visualsDirectory: options.visualsDirectory,
            })
          : []);
        continue;
      }

      ocrPages.add(pageNumber);
      ocrEngine ??= await createLocalOcrEngine();
      const page = await document.getPage(pageNumber);
      const rendered = await renderPdfPageForOcr(page);
      const recognizedLines = await ocrEngine.recognize(rendered.png);
      const acceptedLines = recognizedLines.map((line) => (
        mapOcrLineToPdf(line, pageNumber, rendered)
      ));
      const retainedLines = acceptedLines.length > 0
        ? acceptedLines
        : nativeLines.map((line) => ({...line, confidence: 0.49}));
      const pageConfidence = acceptedLines.length === 0
        ? 0
        : acceptedLines.reduce((total, line) => total + (line.confidence ?? 0), 0)
          / acceptedLines.length;

      pageLines.push(retainedLines);
      pageConfidences.push(pageConfidence);
      pageVisualElements.push(options.visualsDirectory
        ? await extractAndPersistPdfPageVisuals({
            page,
            pageNumber,
            textLines: await extractVisualClassificationLines(document, pageNumber),
            visualsDirectory: options.visualsDirectory,
          })
        : []);
      warnings.push(`PDF page ${pageNumber} used local OCR fallback`);
      if (pageConfidence < 0.85) {
        lowConfidencePages.push({
          page: pageNumber,
          confidence: pageConfidence,
          reason: "local OCR page confidence is below the 0.85 reliability threshold",
        });
        warnings.push(
          `PDF page ${pageNumber} local OCR confidence ${pageConfidence.toFixed(3)} is below 0.85`,
        );
      }
      if (acceptedLines.length === 0) {
        warnings.push(
          `PDF page ${pageNumber} local OCR found no readable text; no content was invented`,
        );
      }
    }

    const allLines = pageLines.flat();
    const {info} = await document.getMetadata();
    const metadata = toMetadataRecord(info);
    const fallbackTitle = basename(absolutePath, extname(absolutePath));
    const title = metadataString(metadata, "Title") ?? fallbackTitle;
    const author = metadataString(metadata, "Author");
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

    let formalChapterNumber = 0;
    const chapters = boundaries.map((boundary, index) => {
      const isFrontMatter = boundary.title === "Front Matter";
      if (!isFrontMatter) formalChapterNumber += 1;
      return {
        chapterId: isFrontMatter
          ? "chapter-front-matter"
          : `chapter-${String(formalChapterNumber).padStart(3, "0")}`,
        title: boundary.title,
        startPage: boundary.startPage,
        endPage: (boundaries[index + 1]?.startPage ?? document.numPages + 1) - 1,
      };
    });

    const pages = pageLines.map((lines, pageIndex) => {
      const pageNumber = pageIndex + 1;
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
          confidence: line.confidence ?? 0.99,
        })),
        visualElements: pageVisualElements[pageIndex] ?? [],
      };
    });

    const tocPage = allLines.find((line) => TOC_MARKER.test(line.text))?.page;
    if (tocPage !== undefined && chapterDetection.source !== "outline") {
      warnings.push(`Table-of-contents marker detected on page ${tocPage}; entries were not used without reliable destinations`);
    }

    const pdfKind = ocrPages.size === 0
      ? "digital" as const
      : ocrPages.size === document.numPages
        ? "scanned" as const
        : "mixed" as const;
    const overallConfidence = pageConfidences.reduce((total, value) => total + value, 0)
      / pageConfidences.length;

    return BookSourceSchema.parse({
      artifact: {
        inputHash: sha256,
        promptVersion: pdfKind === "digital"
          ? "book-source-digital-pdf-v1"
          : "book-source-local-ocr-v1",
        modelProfile: pdfKind === "digital"
          ? "deterministic-pdfjs"
          : "deterministic-pdfjs-local-ocr",
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
        pdfKind,
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
        overallConfidence,
        lowConfidencePages,
        warnings,
      },
    });
  } finally {
    await Promise.all([
      ocrEngine?.terminate() ?? Promise.resolve(),
      loadingTask.destroy(),
    ]);
  }
};
