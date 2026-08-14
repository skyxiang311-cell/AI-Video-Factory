import {describe, expect, it} from "vitest";
import {BOOK_PAUSE_POLICY, PAUSE_POLICY, resolveBookPauseMs, resolvePauseMs} from "../src/narration/pause-policy";

describe("pause policy", () => {
  it("uses distinct pauses within the approved ranges", () => {
    expect(PAUSE_POLICY).toEqual({
      short: 180,
      sentence: 320,
      "knowledge-switch": 500,
      "important-conclusion": 620,
    });
    expect(BOOK_PAUSE_POLICY).toEqual({short: 180, sentence: 220, "knowledge-switch": 430, "important-conclusion": 620});
    expect(resolvePauseMs("short")).toBeGreaterThanOrEqual(100);
    expect(resolveBookPauseMs("sentence")).toBeGreaterThanOrEqual(150);
    expect(resolveBookPauseMs("sentence")).toBeLessThanOrEqual(280);
    expect(resolvePauseMs("knowledge-switch")).toBeGreaterThanOrEqual(400);
    expect(resolvePauseMs("important-conclusion")).toBeLessThanOrEqual(700);
    expect(new Set(Object.values(BOOK_PAUSE_POLICY)).size).toBe(4);
  });
});
