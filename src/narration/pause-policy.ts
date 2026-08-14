export const PAUSE_POLICY = {
  short: 180,
  sentence: 320,
  "knowledge-switch": 500,
  "important-conclusion": 620,
} as const;

export const BOOK_PAUSE_POLICY = {
  short: 180,
  sentence: 220,
  "knowledge-switch": 430,
  "important-conclusion": 620,
} as const;

export type PauseKind = keyof typeof PAUSE_POLICY;

export const resolvePauseMs = (kind: PauseKind): number => PAUSE_POLICY[kind];
export const resolveBookPauseMs = (kind: PauseKind): number => BOOK_PAUSE_POLICY[kind];
