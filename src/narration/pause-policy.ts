export const PAUSE_POLICY = {
  short: 180,
  sentence: 320,
  "knowledge-switch": 500,
  "important-conclusion": 620,
} as const;

export type PauseKind = keyof typeof PAUSE_POLICY;

export const resolvePauseMs = (kind: PauseKind): number => PAUSE_POLICY[kind];
