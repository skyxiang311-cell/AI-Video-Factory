import type {VisualCaption} from "../storyboard/visual-schema";

export type VoiceBoundary = {
  text: string;
  offsetMs: number;
  durationMs: number;
};

type AlignSceneCaptionsInput = {
  sceneId: string;
  text: string;
  speechStartMs: number;
  speechEndMs: number;
  emphasis: string[];
  boundaries: VoiceBoundary[];
};

const MIN_READABLE_CHARACTERS = 8;
const MAX_READABLE_CHARACTERS = 16;
const MAX_RAW_CHARACTERS = 20;
const BREAK_PUNCTUATION = new Set(["，", "。", "！", "？", "；", "：", "、"]);

const normalizedCharacters = (text: string): string[] =>
  Array.from(text).filter((character) => /[\p{L}\p{N}]/u.test(character));

const readableLength = (text: string): number => normalizedCharacters(text).length;

export const segmentChineseCaptionText = (text: string): string[] => {
  const characters = Array.from(text.trim());
  const chunks: string[] = [];
  let current: string[] = [];

  for (const character of characters) {
    current.push(character);
    const readable = readableLength(current.join(""));
    const shouldBreakAtPunctuation =
      BREAK_PUNCTUATION.has(character) && readable >= MIN_READABLE_CHARACTERS;
    const reachedLimit = readable >= MAX_READABLE_CHARACTERS;
    const reachedRawLimit = current.length >= MAX_RAW_CHARACTERS;
    if (shouldBreakAtPunctuation || reachedLimit || reachedRawLimit) {
      chunks.push(current.join(""));
      current = [];
    }
  }

  if (current.length > 0) {
    const tail = current.join("");
    const previous = chunks.at(-1);
    if (
      previous &&
      readableLength(tail) < MIN_READABLE_CHARACTERS &&
      Array.from(previous + tail).length <= MAX_RAW_CHARACTERS
    ) {
      chunks[chunks.length - 1] = previous + tail;
    } else {
      chunks.push(tail);
    }
  }

  return chunks.filter(Boolean);
};

const isReliableBoundarySet = (
  text: string,
  boundaries: VoiceBoundary[],
  speechDurationMs: number,
): boolean => {
  if (boundaries.length === 0) {
    return false;
  }
  let previousEnd = -1;
  for (const boundary of boundaries) {
    if (
      boundary.offsetMs < 0 ||
      boundary.durationMs <= 0 ||
      boundary.offsetMs < previousEnd - 80 ||
      boundary.offsetMs + boundary.durationMs > speechDurationMs + 250
    ) {
      return false;
    }
    previousEnd = boundary.offsetMs + boundary.durationMs;
  }
  const sourceLength = normalizedCharacters(text).length;
  const boundaryLength = normalizedCharacters(
    boundaries.map((boundary) => boundary.text).join(""),
  ).length;
  return sourceLength > 0 && boundaryLength / sourceLength >= 0.72;
};

const resolveEmphasis = (text: string, emphasis: string[]) =>
  emphasis
    .filter((value) => text.includes(value))
    .slice(0, 2)
    .map((value) => ({text: value, style: "accent" as const}));

const alignWithBoundaries = (
  input: AlignSceneCaptionsInput,
  chunks: string[],
): VisualCaption[] => {
  const captions: VisualCaption[] = [];
  let boundaryIndex = 0;
  let previousCaptionEndMs = input.speechStartMs;

  for (const chunk of chunks) {
    const targetLength = Math.max(1, readableLength(chunk));
    const selected: VoiceBoundary[] = [];
    let selectedLength = 0;
    while (boundaryIndex < input.boundaries.length && selectedLength < targetLength) {
      const boundary = input.boundaries[boundaryIndex]!;
      selected.push(boundary);
      selectedLength += Math.max(1, readableLength(boundary.text));
      boundaryIndex += 1;
    }
    if (selected.length === 0) {
      return alignByDuration(input, chunks);
    }
    const first = selected[0]!;
    const last = selected.at(-1)!;
    const startMs = Math.max(
      input.speechStartMs,
      previousCaptionEndMs,
      Math.round(input.speechStartMs + first.offsetMs),
    );
    if (startMs >= input.speechEndMs) {
      return alignByDuration(input, chunks);
    }
    const endMs = Math.min(
      input.speechEndMs,
      Math.max(startMs + 1, Math.round(input.speechStartMs + last.offsetMs + last.durationMs)),
    );
    captions.push({
      text: chunk,
      startMs,
      endMs,
      timestampMs: startMs,
      confidence: null,
      emphasis: resolveEmphasis(chunk, input.emphasis),
      alignmentSource: "edge-word-boundary",
      tokens: selected.map((boundary) => ({
        text: boundary.text,
        startMs: Math.max(startMs, Math.round(input.speechStartMs + boundary.offsetMs)),
        endMs: Math.min(
          endMs,
          Math.max(
            startMs + 1,
            Math.round(input.speechStartMs + boundary.offsetMs + boundary.durationMs),
          ),
        ),
      })),
    });
    previousCaptionEndMs = endMs;
  }
  return captions;
};

const alignByDuration = (
  input: AlignSceneCaptionsInput,
  chunks: string[],
): VisualCaption[] => {
  const durationMs = input.speechEndMs - input.speechStartMs;
  const weights = chunks.map((chunk) => Math.max(1, readableLength(chunk)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = input.speechStartMs;
  return chunks.map((chunk, index): VisualCaption => {
    const isLast = index === chunks.length - 1;
    const allocated = Math.round((durationMs * weights[index]!) / totalWeight);
    const endMs = isLast
      ? input.speechEndMs
      : Math.min(input.speechEndMs, Math.max(cursor + 1, cursor + allocated));
    const caption = {
      text: chunk,
      startMs: cursor,
      endMs,
      timestampMs: cursor,
      confidence: null,
      emphasis: resolveEmphasis(chunk, input.emphasis),
      alignmentSource: "duration-weighted-fallback" as const,
      tokens: [],
    };
    cursor = endMs;
    return caption;
  });
};

export const alignSceneCaptions = (
  input: AlignSceneCaptionsInput,
): VisualCaption[] => {
  const chunks = segmentChineseCaptionText(input.text);
  const speechDurationMs = input.speechEndMs - input.speechStartMs;
  return isReliableBoundarySet(input.text, input.boundaries, speechDurationMs)
    ? alignWithBoundaries(input, chunks)
    : alignByDuration(input, chunks);
};
