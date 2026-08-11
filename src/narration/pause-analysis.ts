import type {VoiceBoundary} from "../subtitles/voice-caption-alignment";

export type PauseAnalysis = {
  gapCount: number;
  medianGapMs: number;
  maxGapMs: number;
  longGapCount: number;
};

export const analyzeBoundaryGaps = (boundaries: VoiceBoundary[]): PauseAnalysis => {
  const gaps = boundaries.slice(1).map((boundary, index) => Math.max(
    0,
    boundary.offsetMs - (
      boundaries[index]!.offsetMs + boundaries[index]!.durationMs
    ),
  ));
  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    gapCount: gaps.length,
    medianGapMs: sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!,
    maxGapMs: sorted.at(-1) ?? 0,
    longGapCount: gaps.filter((gap) => gap >= 700).length,
  };
};
