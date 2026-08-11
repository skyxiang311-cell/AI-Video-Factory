import {describe, expect, it} from "vitest";
import {PAUSE_POLICY, resolvePauseMs} from "../src/narration/pause-policy";

describe("pause policy", () => {
  it("uses distinct pauses within the approved ranges", () => {
    expect(PAUSE_POLICY).toEqual({
      short: 180,
      sentence: 320,
      "knowledge-switch": 500,
      "important-conclusion": 620,
    });
    expect(resolvePauseMs("short")).toBeGreaterThanOrEqual(100);
    expect(resolvePauseMs("sentence")).toBeGreaterThanOrEqual(250);
    expect(resolvePauseMs("knowledge-switch")).toBeGreaterThanOrEqual(400);
    expect(resolvePauseMs("important-conclusion")).toBeLessThanOrEqual(700);
    expect(new Set(Object.values(PAUSE_POLICY)).size).toBe(4);
  });
});
