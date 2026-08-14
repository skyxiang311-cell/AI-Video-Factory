import type {VoiceBoundary} from "../subtitles/voice-caption-alignment";

const readableLength = (text: string): number =>
  Array.from(text).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;

export const calculateTrimWindow = (input: {
  durationMs: number;
  boundaries: VoiceBoundary[];
}): {startMs: number; endMs: number} => {
  const first = input.boundaries[0];
  const last = input.boundaries.at(-1);
  if (!first || !last) return {startMs: 0, endMs: input.durationMs};
  const startMs = Math.max(0, first.offsetMs - 60);
  const endMs = Math.min(
    input.durationMs,
    last.offsetMs + last.durationMs + 90,
  );
  return endMs > startMs ? {startMs, endMs} : {startMs: 0, endMs: input.durationMs};
};

export type BoundaryPartInput = {sceneId: string; text: string};
export type BoundaryPartAssignment = BoundaryPartInput & {
  speechOffsetMs: number;
  speechDurationMs: number;
  boundaries: VoiceBoundary[];
  mappingSource: "boundary-text-match" | "boundary-anchored-fallback" | "duration-weighted-fallback";
};

const normalizedText = (text: string): string =>
  Array.from(text).filter((character) => /[\p{L}\p{N}]/u.test(character)).join("");

const durationWeightedFallback = (
  parts: BoundaryPartInput[],
  boundaries: VoiceBoundary[],
): BoundaryPartAssignment[] => {
  const first = boundaries[0];
  const last = boundaries.at(-1);
  if (!first || !last) throw new Error("Edge 没有可用于时间回退的词边界");
  const startMs = first.offsetMs;
  const endMs = last.offsetMs + last.durationMs;
  const totalDurationMs = endMs - startMs;
  const weights = parts.map((part) => Math.max(1, readableLength(part.text)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = startMs;
  return parts.map((part, index) => {
    const partEnd = index === parts.length - 1
      ? endMs
      : cursor + Math.round(totalDurationMs * weights[index]! / totalWeight);
    const result = {
      ...part,
      speechOffsetMs: cursor,
      speechDurationMs: partEnd - cursor,
      boundaries: [],
      mappingSource: "duration-weighted-fallback" as const,
    };
    cursor = partEnd;
    return result;
  });
};

const boundaryAnchoredFallback = (
  parts: BoundaryPartInput[],
  boundaries: VoiceBoundary[],
): BoundaryPartAssignment[] => {
  const first = boundaries[0];
  const last = boundaries.at(-1);
  if (!first || !last) return durationWeightedFallback(parts, boundaries);
  const ranges: Array<{characterStart: number; characterEnd: number; timeStart: number; timeEnd: number}> = [];
  let characterCursor = 0;
  boundaries.forEach((boundary) => {
    const length = Math.max(1, readableLength(boundary.text));
    ranges.push({
      characterStart: characterCursor,
      characterEnd: characterCursor + length,
      timeStart: boundary.offsetMs,
      timeEnd: boundary.offsetMs + boundary.durationMs,
    });
    characterCursor += length;
  });
  const partTotal = parts.reduce((sum, part) => sum + Math.max(1, readableLength(part.text)), 0);
  const scaledPosition = (position: number): number => position / partTotal * characterCursor;
  const timeAt = (position: number, edge: "start" | "end"): number => {
    const scaled = scaledPosition(position);
    if (scaled <= 0) return first.offsetMs;
    if (scaled >= characterCursor) return last.offsetMs + last.durationMs;
    const range = ranges.find((candidate) => edge === "start"
      ? scaled < candidate.characterEnd
      : scaled <= candidate.characterEnd) ?? ranges.at(-1)!;
    const progress = Math.max(0, Math.min(1,
      (scaled - range.characterStart) / Math.max(1, range.characterEnd - range.characterStart),
    ));
    return Math.round(range.timeStart + (range.timeEnd - range.timeStart) * progress);
  };
  let partCursor = 0;
  return parts.map((part) => {
    const length = Math.max(1, readableLength(part.text));
    const speechOffsetMs = timeAt(partCursor, "start");
    partCursor += length;
    const speechEndMs = Math.max(speechOffsetMs + 1, timeAt(partCursor, "end"));
    const speechDurationMs = speechEndMs - speechOffsetMs;
    return {
      ...part,
      speechOffsetMs,
      speechDurationMs,
      boundaries: [{text: part.text, offsetMs: 0, durationMs: speechDurationMs}],
      mappingSource: "boundary-anchored-fallback" as const,
    };
  });
};

export const assignBoundariesToParts = (
  parts: BoundaryPartInput[],
  boundaries: VoiceBoundary[],
): BoundaryPartAssignment[] => {
  if (parts.length === 0) return [];
  let boundaryIndex = 0;
  const assignments: BoundaryPartAssignment[] = [];
  for (const [partIndex, part] of parts.entries()) {
    const targetLength = Math.max(1, readableLength(part.text));
    const selected: VoiceBoundary[] = [];
    let selectedLength = 0;
    while (
      boundaryIndex < boundaries.length &&
      (selectedLength < targetLength || partIndex === parts.length - 1)
    ) {
      const boundary = boundaries[boundaryIndex]!;
      selected.push(boundary);
      selectedLength += Math.max(1, readableLength(boundary.text));
      boundaryIndex += 1;
      if (partIndex === parts.length - 1) continue;
      if (selectedLength >= targetLength) break;
    }
    if (selected.length === 0) {
      return boundaryAnchoredFallback(parts, boundaries);
    }
    const first = selected[0]!;
    const last = selected.at(-1)!;
    const speechOffsetMs = first.offsetMs;
    const speechDurationMs = last.offsetMs + last.durationMs - speechOffsetMs;
    assignments.push({
      ...part,
      speechOffsetMs,
      speechDurationMs,
      boundaries: selected.map((boundary) => ({
        ...boundary,
        offsetMs: boundary.offsetMs - speechOffsetMs,
      })),
      mappingSource: "boundary-text-match" as const,
    });
  }
  const isExactMatch = assignments.every((assignment) =>
    normalizedText(assignment.text) === normalizedText(
      assignment.boundaries.map((boundary) => boundary.text).join(""),
    ));
  return isExactMatch
    ? assignments
    : boundaryAnchoredFallback(parts, boundaries);
};

export const shiftBoundariesAfterTrim = (
  boundaries: VoiceBoundary[],
  trimStartMs: number,
): VoiceBoundary[] => boundaries.map((boundary) => ({
  ...boundary,
  offsetMs: Math.max(0, boundary.offsetMs - trimStartMs),
}));
