import {describe, expect, it} from "vitest";
import {
  countReadableCharacters,
  layoutChineseCaption,
  tokenizeCaptionLine,
} from "../src/storyboard/caption-layout";

describe("Chinese caption layout", () => {
  it("counts Chinese readable characters without punctuation", () => {
    expect(countReadableCharacters("先回忆，再核对缺口！")).toBe(8);
  });

  it("keeps a short caption on one line", () => {
    expect(layoutChineseCaption("合上书开始主动回忆")).toEqual([
      "合上书开始主动回忆",
    ]);
  });

  it("breaks a longer caption at a Chinese punctuation boundary", () => {
    expect(layoutChineseCaption("先回忆，再核对缺口和答案")).toEqual([
      "先回忆，",
      "再核对缺口和答案",
    ]);
  });

  it("rejects captions that require more than two safe lines", () => {
    expect(() =>
      layoutChineseCaption("这是一条明显超过手机安全字幕容量并且无法在两行之内展示的文本"),
    ).toThrow(/两行/);
  });

  it("splits keyword emphasis into renderable tokens", () => {
    expect(
      tokenizeCaptionLine("先回忆再核对", [
        {text: "回忆", style: "large"},
        {text: "核对", style: "accent"},
      ]),
    ).toEqual([
      {text: "先", style: "normal"},
      {text: "回忆", style: "large"},
      {text: "再", style: "normal"},
      {text: "核对", style: "accent"},
    ]);
  });
});
