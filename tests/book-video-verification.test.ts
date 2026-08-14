import {describe, expect, it} from "vitest";
import {assertBookVideoDurationRange, BOOK_VIDEO_BLACKDETECT_FILTER, longestStaticVisualDurationMs} from "../src/research/book/book-video-verification";

describe("Book video blank-scene verification", () => {
  it("uses a genuinely dark pixel threshold instead of classifying the dark theme as blank", () => {
    expect(BOOK_VIDEO_BLACKDETECT_FILTER).toBe("blackdetect=d=1:pix_th=0.10:pic_th=0.99");
  });

  it("measures the conservative longest interval without a scene-level visual change", () => {
    expect(longestStaticVisualDurationMs([
      {startMs: 0, endMs: 4_500},
      {startMs: 4_500, endMs: 10_200},
    ])).toBe(5_700);
  });

  it("requires the real voice target while retaining the final video tolerance", () => {
    expect(() => assertBookVideoDurationRange(284_999, 295_000)).toThrow(/voice/);
    expect(() => assertBookVideoDurationRange(295_000, 269_999)).toThrow(/final/);
    expect(() => assertBookVideoDurationRange(295_000, 295_050)).not.toThrow();
  });
});
