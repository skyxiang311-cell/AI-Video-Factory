import {createCanvas} from "@napi-rs/canvas";
import type {PDFPageProxy} from "pdfjs-dist/legacy/build/pdf.mjs";

export interface RenderedPdfPage {
  png: Buffer;
  width: number;
  height: number;
  pdfWidth: number;
  pdfHeight: number;
}

const OCR_RENDER_SCALE = 2.5;

export const renderPdfPageForOcr = async (
  page: PDFPageProxy,
): Promise<RenderedPdfPage> => {
  const pdfViewport = page.getViewport({scale: 1});
  const renderViewport = page.getViewport({scale: OCR_RENDER_SCALE});
  const canvas = createCanvas(
    Math.ceil(renderViewport.width),
    Math.ceil(renderViewport.height),
  );
  const context = canvas.getContext("2d");

  await page.render({
    canvas: null,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport: renderViewport,
    background: "rgb(255,255,255)",
  }).promise;

  return {
    png: canvas.toBuffer("image/png"),
    width: canvas.width,
    height: canvas.height,
    pdfWidth: pdfViewport.width,
    pdfHeight: pdfViewport.height,
  };
};
