import {describe, expect, it} from "vitest";
import {formatMetricValue} from "../src/render/knowledge/scenes/stat-format";

describe("formatMetricValue", () => {
  it("animates numeric values before applying display affixes", () => {
    expect(formatMetricValue(3, 0.5, 0, "", "步")).toBe("2步");
    expect(formatMetricValue(72.5, 1, 1, "约", "%")).toBe("约72.5%");
  });

  it("never renders a value beyond the target", () => {
    expect(formatMetricValue(3, 1.5, 0, "", "步")).toBe("3步");
  });
});
