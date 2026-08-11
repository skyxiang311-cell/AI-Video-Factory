import {describe, expect, it} from "vitest";
import {buildDiagramLayout} from "../src/render/knowledge/scenes/diagram-layout";

describe("buildDiagramLayout", () => {
  it("spreads a three-step flow across the vertical canvas", () => {
    expect(buildDiagramLayout("vertical-flow", 3)).toEqual([
      {x: 0.5, y: 0.14},
      {x: 0.5, y: 0.5},
      {x: 0.5, y: 0.86},
    ]);
  });

  it("creates distinct positions for a three-node cycle", () => {
    expect(buildDiagramLayout("cycle", 3)).toEqual([
      {x: 0.5, y: 0.12},
      {x: 0.86, y: 0.76},
      {x: 0.14, y: 0.76},
    ]);
  });

  it("rejects unsupported node counts", () => {
    expect(() => buildDiagramLayout("horizontal-flow", 1)).toThrow(/2/);
    expect(() => buildDiagramLayout("horizontal-flow", 6)).toThrow(/5/);
  });
});
