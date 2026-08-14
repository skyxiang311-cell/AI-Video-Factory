export const buildMeaningfulBeatFrames = (
  durationInFrames: number,
  fps: number,
  beatCount: number,
): number[] => {
  if (beatCount < 1 || beatCount > 4) throw new Error("视觉变化数量必须为 1 到 4");
  const safeDuration = Math.max(beatCount, durationInFrames);
  const start = Math.min(Math.round(fps * 0.35), Math.floor(safeDuration / (beatCount + 1)));
  const end = Math.max(start, safeDuration - Math.min(Math.round(fps * 0.8), Math.floor(safeDuration / (beatCount + 1))));
  if (beatCount === 1) return [start];
  return Array.from({length: beatCount}, (_, index) =>
    Math.round(start + ((end - start) * index) / (beatCount - 1)),
  );
};
