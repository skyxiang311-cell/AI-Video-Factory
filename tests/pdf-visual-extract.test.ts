import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {describe, expect, it} from "vitest";
import {extractAndPersistPdfPageVisuals} from "../src/research/book/pdf-visual-extract";

const fixturePath = fileURLToPath(
  new URL("./fixtures/complex-visual-book.pdf", import.meta.url),
);

const captionLines = [
  {text: "Figure 1 Product image", bbox: [50, 540, 140, 12] as const},
  {text: "Table 1 Results", bbox: [50, 330, 100, 12] as const},
  {text: "Chart 1 Growth", bbox: [330, 330, 100, 12] as const},
  {text: "Diagram 1 Process", bbox: [80, 100, 120, 12] as const},
];

describe("PDF visual extraction", () => {
  it("locates conservatively typed PDF visuals and writes stable PNG crops", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-pdf-visuals-"));
    const loadingTask = getDocument({
      data: new Uint8Array(await readFile(fixturePath)),
    });
    try {
      const document = await loadingTask.promise;
      const elements = await extractAndPersistPdfPageVisuals({
        page: await document.getPage(1),
        pageNumber: 1,
        textLines: captionLines,
        visualsDirectory: directory,
      });

      expect(elements.map((element) => ({
        elementId: element.elementId,
        page: element.page,
        type: element.type,
        assetPath: element.assetPath,
      }))).toEqual([
        {elementId: "p1-v1", page: 1, type: "image", assetPath: "visuals/p1-v1.png"},
        {elementId: "p1-v2", page: 1, type: "table", assetPath: "visuals/p1-v2.png"},
        {elementId: "p1-v3", page: 1, type: "chart", assetPath: "visuals/p1-v3.png"},
        {elementId: "p1-v4", page: 1, type: "diagram", assetPath: "visuals/p1-v4.png"},
      ]);
      expect(elements.map((element) => element.bbox)).toEqual([
        [50, 560, 200, 120],
        [50, 350, 240, 120],
        [330, 350, 210, 130],
        [80, 120, 400, 90],
      ]);

      for (const element of elements) {
        expect(element.confidence).toBeGreaterThan(0);
        expect(element.confidence).toBeLessThanOrEqual(1);
        const png = await readFile(join(directory, `${element.elementId}.png`));
        expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
        expect(png.length).toBeGreaterThan(100);
      }

      const withoutDiagramLabel = await extractAndPersistPdfPageVisuals({
        page: await document.getPage(1),
        pageNumber: 1,
        textLines: captionLines.slice(0, 3),
        visualsDirectory: directory,
      });
      expect(withoutDiagramLabel[3]).toMatchObject({
        type: "other",
        description: "Unclassified PDF vector region",
        confidence: 0.6,
      });
    } finally {
      await Promise.all([
        loadingTask.destroy(),
        rm(directory, {force: true, recursive: true}),
      ]);
    }
  });
});
