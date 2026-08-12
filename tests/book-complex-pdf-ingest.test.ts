import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {ingestDigitalPdf} from "../src/research/book/pdf-ingest";
import {BookSourceSchema} from "../src/research/book/source-schema";

const fixturePath = fileURLToPath(
  new URL("./fixtures/complex-visual-book.pdf", import.meta.url),
);

describe("complex PDF book ingest", () => {
  it("writes located visual elements and valid local crop references into BookSource", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-complex-pdf-"));
    const visualsDirectory = join(directory, "visuals");
    try {
      const source = await ingestDigitalPdf(fixturePath, {
        createdAt: "2026-08-12T00:00:00.000Z",
        visualsDirectory,
      });

      expect(BookSourceSchema.parse(source)).toEqual(source);
      expect(source.metadata.pageCount).toBe(1);
      expect(source.document.pdfKind).toBe("digital");
      const elements = source.pages.flatMap((page) => page.visualElements);
      expect(elements.map((element) => element.type)).toEqual([
        "image",
        "table",
        "chart",
        "diagram",
      ]);
      expect(elements.map((element) => element.elementId)).toEqual([
        "p1-v1",
        "p1-v2",
        "p1-v3",
        "p1-v4",
      ]);
      expect(elements.every((element) => element.page === 1)).toBe(true);
      expect(elements.every((element) => element.assetPath === (
        `visuals/${element.elementId}.png`
      ))).toBe(true);
      for (const element of elements) {
        const png = await readFile(join(directory, element.assetPath!));
        expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      }
    } finally {
      await rm(directory, {force: true, recursive: true});
    }
  });
});
