import {describe, expect, it} from "vitest";
import {
  fitMetricFontSize,
  formatMetricValue,
} from "../src/render/knowledge/scenes/stat-format";

describe("formatMetricValue", () => {
  it("animates numeric values before applying display affixes", () => {
    expect(formatMetricValue(3, 0.5, 0, "", "步")).toBe("2步");
    expect(formatMetricValue(72.5, 1, 1, "约", "%")).toBe("约72.5%");
  });

  it("never renders a value beyond the target", () => {
    expect(formatMetricValue(3, 1.5, 0, "", "步")).toBe("3步");
  });

  it("reduces long metric labels to fit one safe line", () => {
    expect(fitMetricFontSize("3步", 720, 220)).toBe(220);
    expect(fitMetricFontSize("3个动作", 720, 220)).toBe(180);
  });
});
