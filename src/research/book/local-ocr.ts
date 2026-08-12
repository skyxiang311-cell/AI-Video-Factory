import {createRequire} from "node:module";
import {copyFile, mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {createWorker, OEM, PSM} from "tesseract.js";

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface LocalOcrEngine {
  recognize(image: Buffer): Promise<OcrLine[]>;
  terminate(): Promise<void>;
}

interface InstalledLanguageData {
  code: string;
  gzip: boolean;
  langPath: string;
}

const require = createRequire(import.meta.url);
const LANGUAGE_PACKAGES = [
  "@tesseract.js-data/chi_sim",
  "@tesseract.js-data/jpn",
  "@tesseract.js-data/eng",
] as const;
const MINIMUM_LINE_CONFIDENCE = 0.5;

export const prepareLocalOcrLanguageData = async (): Promise<string> => {
  const targetDirectory = resolve(".cache", "book-ocr", "tessdata-v1");
  await mkdir(targetDirectory, {recursive: true});

  for (const packageName of LANGUAGE_PACKAGES) {
    const installed = require(packageName) as InstalledLanguageData;
    if (!installed.gzip || /^https?:/u.test(installed.langPath)) {
      throw new Error(`${packageName} must provide local gzipped OCR language data`);
    }
    await copyFile(
      resolve(installed.langPath, `${installed.code}.traineddata.gz`),
      resolve(targetDirectory, `${installed.code}.traineddata.gz`),
    );
  }

  return targetDirectory;
};

const normalizeConfidence = (confidence: number): number => (
  Math.max(0, Math.min(1, confidence / 100))
);

export const createLocalOcrEngine = async (): Promise<LocalOcrEngine> => {
  const langPath = await prepareLocalOcrLanguageData();
  const worker = await createWorker(
    ["chi_sim", "jpn", "eng"],
    OEM.LSTM_ONLY,
    {
      cacheMethod: "none",
      gzip: true,
      langPath,
    },
  );
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: PSM.AUTO,
    user_defined_dpi: "180",
  });
  let terminated = false;

  return {
    recognize: async (image) => {
      const result = await worker.recognize(
        image,
        {rotateAuto: true},
        {blocks: true, text: true},
      );
      const lines = (result.data.blocks ?? []).flatMap((block) => (
        block.paragraphs.flatMap((paragraph) => paragraph.lines)
      ));

      return lines
        .map((line): OcrLine => ({
          text: line.text.trim(),
          confidence: normalizeConfidence(line.confidence),
          bbox: [
            line.bbox.x0,
            line.bbox.y0,
            line.bbox.x1 - line.bbox.x0,
            line.bbox.y1 - line.bbox.y0,
          ],
        }))
        .filter((line) => (
          line.text.length > 0 && line.confidence >= MINIMUM_LINE_CONFIDENCE
        ))
        .sort((left, right) => (
          left.bbox[1] - right.bbox[1] || left.bbox[0] - right.bbox[0]
        ));
    },
    terminate: async () => {
      if (terminated) return;
      terminated = true;
      await worker.terminate();
    },
  };
};
