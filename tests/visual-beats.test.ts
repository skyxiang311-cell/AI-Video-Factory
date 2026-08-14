import {describe, expect, it} from "vitest";
import {buildMeaningfulBeatFrames} from "../src/render/knowledge/visual-beats";

describe("meaningful visual beats", () => {
  it("distributes 2-4 content changes through a scene with no gap over six seconds", () => {
    const beats = buildMeaningfulBeatFrames(300, 30, 4);
    expect(beats).toHaveLength(4);
    const gaps = [beats[0]!, ...beats.slice(1).map((beat, index) => beat - beats[index]!), 300 - beats.at(-1)!];
    expect(Math.max(...gaps)).toBeLessThanOrEqual(180);
  });
});
