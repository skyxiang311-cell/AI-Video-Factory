import {describe, expect, it} from "vitest";
import {
  getSceneProgress,
  resolveAccent,
  resolveCanvasColors,
} from "../src/render/knowledge/visual-utils";

describe("Knowledge visual utilities", () => {
  it("resolves a restrained named accent instead of arbitrary copy colors", () => {
    expect(resolveAccent("vermilion")).toBe("#e5634f");
    expect(resolveAccent("indigo")).toBe("#65758b");
  });

  it("calculates bounded scene progress", () => {
    expect(getSceneProgress(0, 6)).toBeCloseTo(1 / 6);
    expect(getSceneProgress(5, 6)).toBe(1);
    expect(getSceneProgress(10, 6)).toBe(1);
  });

  it("provides contrasting ink and paper canvas colors", () => {
    expect(resolveCanvasColors("ink")).toEqual({
      background: "#101216",
      foreground: "#f3f0e8",
      muted: "#a7a9ad",
      panel: "#1b1e24",
    });
    expect(resolveCanvasColors("paper")).toEqual({
      background: "#f1eee5",
      foreground: "#17191d",
      muted: "#666a70",
      panel: "#e6e1d6",
    });
  });
});
