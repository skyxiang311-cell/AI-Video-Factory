import {readFile, readdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {describe, expect, it} from "vitest";
import {
  createLocalOcrEngine,
  prepareLocalOcrLanguageData,
} from "../src/research/book/local-ocr";
import {renderPdfPageForOcr} from "../src/research/book/pdf-page-render";

const fixturePath = fileURLToPath(new URL("./fixtures/scanned-book.pdf", import.meta.url));

describe("local multilingual OCR", () => {
  it("stages all required installed language data in one local directory", async () => {
    const languageDirectory = await prepareLocalOcrLanguageData();

    expect((await readdir(languageDirectory)).sort()).toEqual([
      "chi_sim.traineddata.gz",
      "eng.traineddata.gz",
      "jpn.traineddata.gz",
    ]);
  });

  it("recognizes real Simplified Chinese, Japanese, and English scan lines", async () => {
    const loadingTask = getDocument({data: new Uint8Array(await readFile(fixturePath))});
    const engine = await createLocalOcrEngine();
    try {
      const document = await loadingTask.promise;
      const rendered = await renderPdfPageForOcr(await document.getPage(1));
      const lines = await engine.recognize(rendered.png);
      const text = lines.map((line) => line.text).join(" ");

      expect(text).toContain("Chapter 1");
      expect(text).toMatch(/\p{Script=Han}/u);
      expect(text).toMatch(/[\u3040-\u30ff]/u);
      expect(lines.every((line) => line.confidence >= 0.5 && line.confidence <= 1))
        .toBe(true);
      expect(lines).toEqual([...lines].sort((left, right) => (
        left.bbox[1] - right.bbox[1] || left.bbox[0] - right.bbox[0]
      )));
    } finally {
      await Promise.all([engine.terminate(), loadingTask.destroy()]);
    }
  }, 60_000);
});
