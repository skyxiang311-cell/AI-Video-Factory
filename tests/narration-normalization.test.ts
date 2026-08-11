import {describe, expect, it} from "vitest";
import {normalizeSpeechText} from "../src/narration/normalize-speech";

describe("normalizeSpeechText", () => {
  it("turns numbered written Chinese into continuous spoken Chinese", () => {
    const result = normalizeSpeechText("1. 因此，先回忆。\n2. 此外，再核对。  ");

    expect(result.text).toBe("所以，先回忆。另外，再核对。");
    expect(result.changes).toEqual(expect.arrayContaining([
      "remove-list-markers",
      "replace-written-connectors",
    ]));
  });

  it("preserves confirmed numbers and currency units", () => {
    const result = normalizeSpeechText("价格是 3000 日元，因此不要只说 3000。 ");

    expect(result.text).toContain("3000 日元");
    expect(result.text.match(/3000/gu)).toHaveLength(2);
  });

  it("rejects an unsafe normalization that loses a confirmed fact token", () => {
    expect(() => normalizeSpeechText("比例是 80%，因此值得记住。", {
      transform: () => "所以值得记住。",
    })).toThrow(/事实标记/);
  });

  it("turns unpunctuated numbered lines into spoken transitions", () => {
    const result = normalizeSpeechText("1. 主动回忆\n2. 核对缺口\n3. 间隔练习");

    expect(result.text).toBe("主动回忆。接着，核对缺口。最后，间隔练习。");
  });

  it("preserves caller-declared proper nouns", () => {
    expect(() => normalizeSpeechText("Remotion 负责渲染。", {
      protectedTerms: ["Remotion"],
      transform: () => "负责渲染。",
    })).toThrow(/保护词/);
  });
});
