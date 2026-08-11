import {describe, expect, it} from "vitest";
import {
  getCaptionMotion,
  resolveCaptionTokenStyle,
} from "../src/render/knowledge/caption-motion";

describe("caption motion and emphasis", () => {
  it("enters, holds and exits within its own timeline", () => {
    expect(getCaptionMotion(0, 60)).toEqual({opacity: 0, translateY: 24});
    expect(getCaptionMotion(8, 60)).toEqual({opacity: 1, translateY: 0});
    expect(getCaptionMotion(30, 60)).toEqual({opacity: 1, translateY: 0});
    expect(getCaptionMotion(59, 60).opacity).toBeLessThan(0.2);
  });

  it("keeps keyword size emphasis restrained", () => {
    expect(resolveCaptionTokenStyle("large")).toEqual({
      colorRole: "accent",
      fontScale: 1.12,
      fontWeight: 900,
    });
    expect(resolveCaptionTokenStyle("normal")).toEqual({
      colorRole: "foreground",
      fontScale: 1,
      fontWeight: 760,
    });
  });
});
