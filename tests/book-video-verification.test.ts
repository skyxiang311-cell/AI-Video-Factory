import {describe, expect, it} from "vitest";
import {BOOK_VIDEO_BLACKDETECT_FILTER} from "../src/research/book/book-video-verification";

describe("Book video blank-scene verification", () => {
  it("uses a genuinely dark pixel threshold instead of classifying the dark theme as blank", () => {
    expect(BOOK_VIDEO_BLACKDETECT_FILTER).toBe("blackdetect=d=1:pix_th=0.10:pic_th=0.99");
  });
});
