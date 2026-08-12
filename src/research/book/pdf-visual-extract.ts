import {mkdir, rename, unlink, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {createCanvas, loadImage} from "@napi-rs/canvas";
import {
  OPS,
  type PDFPageProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import {renderPdfPageForOcr} from "./pdf-page-render";

type BoundingBox = [number, number, number, number];
type Matrix = [number, number, number, number, number, number];
type VisualType = "image" | "chart" | "table" | "diagram" | "other";

export interface VisualClassificationLine {
  text: string;
  bbox: readonly [number, number, number, number];
}

export interface ExtractedPdfVisualElement {
  elementId: string;
  page: number;
  type: VisualType;
  bbox: BoundingBox;
  description: string;
  confidence: number;
  assetPath: string;
}

interface VisualCandidate {
  kind: "image" | "vector";
  bbox: BoundingBox;
}

interface GraphicsFrame {
  matrix: Matrix;
  vectorBounds: BoundingBox | null;
  pathCount: number;
}

interface ExtractVisualOptions {
  page: PDFPageProxy;
  pageNumber: number;
  textLines: VisualClassificationLine[];
  visualsDirectory: string;
}

const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];
const MIN_VISUAL_AREA = 400;
const MAX_PAGE_COVERAGE = 0.8;
const MAX_CAPTION_DISTANCE = 60;

const roundCoordinate = (value: number): number => Math.round(value * 1_000) / 1_000;

const concatenate = (left: Matrix, right: Matrix): Matrix => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
];

const transformPoint = (matrix: Matrix, x: number, y: number): [number, number] => [
  matrix[0] * x + matrix[2] * y + matrix[4],
  matrix[1] * x + matrix[3] * y + matrix[5],
];

const transformBounds = (matrix: Matrix, bounds: BoundingBox): BoundingBox => {
  const [x, y, width, height] = bounds;
  const points = [
    transformPoint(matrix, x, y),
    transformPoint(matrix, x + width, y),
    transformPoint(matrix, x, y + height),
    transformPoint(matrix, x + width, y + height),
  ];
  const xCoordinates = points.map((point) => point[0]);
  const yCoordinates = points.map((point) => point[1]);
  const x1 = Math.min(...xCoordinates);
  const y1 = Math.min(...yCoordinates);
  const x2 = Math.max(...xCoordinates);
  const y2 = Math.max(...yCoordinates);

  return [
    roundCoordinate(x1),
    roundCoordinate(y1),
    roundCoordinate(x2 - x1),
    roundCoordinate(y2 - y1),
  ];
};

const mergeBounds = (left: BoundingBox | null, right: BoundingBox): BoundingBox => {
  if (!left) return right;
  const x1 = Math.min(left[0], right[0]);
  const y1 = Math.min(left[1], right[1]);
  const x2 = Math.max(left[0] + left[2], right[0] + right[2]);
  const y2 = Math.max(left[1] + left[3], right[1] + right[3]);
  return [x1, y1, roundCoordinate(x2 - x1), roundCoordinate(y2 - y1)];
};

const toMatrix = (value: unknown): Matrix | null => {
  if (!Array.isArray(value) || value.length < 6 || value.some((entry) => typeof entry !== "number")) {
    return null;
  }
  return value.slice(0, 6) as Matrix;
};

const toPathBounds = (value: unknown): BoundingBox | null => {
  if (!value || typeof value !== "object") return null;
  const entries = Array.from(value as ArrayLike<unknown>);
  if (entries.length < 4 || entries.slice(0, 4).some((entry) => typeof entry !== "number")) {
    return null;
  }
  const [x1, y1, x2, y2] = entries as number[];
  return [x1!, y1!, x2! - x1!, y2! - y1!];
};

const isEligibleBounds = (
  bounds: BoundingBox,
  pageWidth: number,
  pageHeight: number,
): boolean => {
  const area = bounds[2] * bounds[3];
  return bounds[2] > 0
    && bounds[3] > 0
    && area >= MIN_VISUAL_AREA
    && area / (pageWidth * pageHeight) < MAX_PAGE_COVERAGE;
};

const extractCandidates = async (page: PDFPageProxy): Promise<VisualCandidate[]> => {
  const operatorList = await page.getOperatorList();
  const viewport = page.getViewport({scale: 1});
  const candidates: VisualCandidate[] = [];
  const frames: GraphicsFrame[] = [{
    matrix: [...IDENTITY_MATRIX],
    vectorBounds: null,
    pathCount: 0,
  }];
  const currentFrame = (): GraphicsFrame => frames[frames.length - 1]!;
  const finalizeFrame = (frame: GraphicsFrame): void => {
    if (
      frame.vectorBounds
      && frame.pathCount >= 2
      && isEligibleBounds(frame.vectorBounds, viewport.width, viewport.height)
    ) {
      candidates.push({kind: "vector", bbox: frame.vectorBounds});
    }
  };

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const operator = operatorList.fnArray[index];
    const argumentsForOperator = operatorList.argsArray[index] as unknown[] | null;

    if (operator === OPS.save) {
      frames.push({
        matrix: [...currentFrame().matrix],
        vectorBounds: null,
        pathCount: 0,
      });
      continue;
    }
    if (operator === OPS.restore) {
      if (frames.length > 1) finalizeFrame(frames.pop()!);
      continue;
    }
    if (operator === OPS.transform) {
      const matrix = toMatrix(argumentsForOperator);
      if (matrix) currentFrame().matrix = concatenate(currentFrame().matrix, matrix);
      continue;
    }
    if (operator === OPS.constructPath) {
      const pathBounds = toPathBounds(argumentsForOperator?.[2]);
      if (pathBounds) {
        const transformed = transformBounds(currentFrame().matrix, pathBounds);
        currentFrame().vectorBounds = mergeBounds(currentFrame().vectorBounds, transformed);
        currentFrame().pathCount += 1;
      }
      continue;
    }
    if (
      operator === OPS.paintImageXObject
      || operator === OPS.paintInlineImageXObject
      || operator === OPS.paintImageMaskXObject
      || operator === OPS.paintSolidColorImageMask
    ) {
      const bounds = transformBounds(currentFrame().matrix, [0, 0, 1, 1]);
      if (isEligibleBounds(bounds, viewport.width, viewport.height)) {
        candidates.push({kind: "image", bbox: bounds});
      }
    }
  }

  frames.slice(1).reverse().forEach(finalizeFrame);
  finalizeFrame(frames[0]!);
  return candidates;
};

const captionType = (text: string): Exclude<VisualType, "image" | "other"> | null => {
  if (/^(?:table\b|表(?:格|\s|\d)|表格)/iu.test(text)) return "table";
  if (/^(?:chart\b|graph\b|图表|グラフ)/iu.test(text)) return "chart";
  if (/^(?:diagram\b|流程图|示意图|ダイアグラム)/iu.test(text)) return "diagram";
  return null;
};

const rectangleDistance = (
  visual: BoundingBox,
  caption: readonly [number, number, number, number],
): number => {
  const horizontal = Math.max(
    0,
    visual[0] - (caption[0] + caption[2]),
    caption[0] - (visual[0] + visual[2]),
  );
  const vertical = Math.max(
    0,
    visual[1] - (caption[1] + caption[3]),
    caption[1] - (visual[1] + visual[3]),
  );
  return Math.hypot(horizontal, vertical);
};

const classifyCandidate = (
  candidate: VisualCandidate,
  lines: VisualClassificationLine[],
): {type: VisualType; description: string; confidence: number} => {
  const caption = lines
    .map((line) => ({line, distance: rectangleDistance(candidate.bbox, line.bbox)}))
    .filter(({distance}) => distance <= MAX_CAPTION_DISTANCE)
    .sort((left, right) => left.distance - right.distance)[0]?.line;
  const explicitType = caption ? captionType(caption.text) : null;

  if (explicitType) {
    return {type: explicitType, description: caption!.text, confidence: 0.99};
  }
  if (candidate.kind === "image") {
    return {
      type: "image",
      description: caption?.text ?? "Embedded PDF image",
      confidence: 0.95,
    };
  }
  return {
    type: "other",
    description: caption?.text ?? "Unclassified PDF vector region",
    confidence: 0.6,
  };
};

const atomicWritePng = async (targetPath: string, data: Buffer): Promise<void> => {
  const temporaryPath = `${targetPath}.tmp`;
  try {
    await mkdir(dirname(targetPath), {recursive: true});
    await writeFile(temporaryPath, data);
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw new Error(`Failed to persist PDF visual crop: ${targetPath}`, {cause: error});
  }
};

export const extractAndPersistPdfPageVisuals = async ({
  page,
  pageNumber,
  textLines,
  visualsDirectory,
}: ExtractVisualOptions): Promise<ExtractedPdfVisualElement[]> => {
  const candidates = await extractCandidates(page);
  if (candidates.length === 0) return [];

  const rendered = await renderPdfPageForOcr(page);
  const pageImage = await loadImage(rendered.png);
  const xScale = rendered.width / rendered.pdfWidth;
  const yScale = rendered.height / rendered.pdfHeight;
  const elements: ExtractedPdfVisualElement[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const elementId = `p${pageNumber}-v${index + 1}`;
    const [x, y, width, height] = candidate.bbox;
    const left = Math.max(0, Math.floor(x * xScale));
    const top = Math.max(0, Math.floor((rendered.pdfHeight - y - height) * yScale));
    const right = Math.min(rendered.width, Math.ceil((x + width) * xScale));
    const bottom = Math.min(rendered.height, Math.ceil((rendered.pdfHeight - y) * yScale));
    const cropWidth = Math.max(1, right - left);
    const cropHeight = Math.max(1, bottom - top);
    const canvas = createCanvas(cropWidth, cropHeight);
    canvas.getContext("2d").drawImage(
      pageImage,
      left,
      top,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );
    await atomicWritePng(
      join(visualsDirectory, `${elementId}.png`),
      canvas.toBuffer("image/png"),
    );
    elements.push({
      elementId,
      page: pageNumber,
      bbox: candidate.bbox,
      assetPath: `visuals/${elementId}.png`,
      ...classifyCandidate(candidate, textLines),
    });
  }

  return elements;
};
