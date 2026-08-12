import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {describe, expect, it} from "vitest";
import {renderPdfPageForOcr} from "../src/research/book/pdf-page-render";

const fixturePath = fileURLToPath(new URL("./fixtures/scanned-book.pdf", import.meta.url));

describe("PDF page OCR rendering", () => {
  it("renders a real image-only PDF page without relying on a text layer", async () => {
    const loadingTask = getDocument({data: new Uint8Array(await readFile(fixturePath))});
    try {
      const document = await loadingTask.promise;
      expect(document.numPages).toBe(2);

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const text = await (await document.getPage(pageNumber)).getTextContent();
        const extracted = text.items
          .filter((item): item is typeof item & {str: string} => "str" in item)
          .map((item) => item.str.trim())
          .filter(Boolean);
        expect(extracted).toEqual([]);
      }

      const rendered = await renderPdfPageForOcr(await document.getPage(1));
      expect(rendered.png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(rendered.width).toBe(1_530);
      expect(rendered.height).toBe(1_980);
      expect(rendered.pdfWidth).toBe(612);
      expect(rendered.pdfHeight).toBe(792);
    } finally {
      await loadingTask.destroy();
    }
  });
});
