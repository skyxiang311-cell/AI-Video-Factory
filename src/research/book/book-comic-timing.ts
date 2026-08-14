export const resolveComicVisualState = (input: {
  absoluteMs: number;
  shotStartMs: number;
  turns: Array<{startMs: number; endMs: number}>;
  visualBeats: Array<{atMs: number; kind: string}>;
}) => {
  const activeTurnIndex = Math.max(0, input.turns.findIndex((turn) => input.absoluteMs >= turn.startMs && input.absoluteMs < turn.endMs));
  const localMs = Math.max(0, input.absoluteMs - input.shotStartMs);
  return {
    activeTurnIndex,
    revealedBeatKinds: input.visualBeats.filter((beat) => beat.atMs <= localMs).map((beat) => beat.kind),
  };
};

export const resolveComicCharacterPoses = (
  turns: Array<{speaker: string; pose: string}>,
  activeTurnIndex: number,
): {xiaoyuan: string; douzai: string} => {
  const active = turns[activeTurnIndex];
  const latestPose = (speaker: "xiaoyuan" | "douzai", fallback: string): string => {
    if (active?.speaker === speaker) return active.pose;
    return turns.slice(0, activeTurnIndex + 1).reverse().find((turn) => turn.speaker === speaker)?.pose
      ?? turns.find((turn) => turn.speaker === speaker)?.pose
      ?? fallback;
  };
  return {xiaoyuan: latestPose("xiaoyuan", "explain"), douzai: latestPose("douzai", "question")};
};
