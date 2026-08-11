export const formatMetricValue = (
  target: number,
  progress: number,
  decimals: number,
  prefix: string,
  suffix: string,
): string => {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const current = target * clampedProgress;
  const value = decimals === 0 ? Math.round(current).toString() : current.toFixed(decimals);
  return `${prefix}${value}${suffix}`;
};
