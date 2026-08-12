# Book Deep Reading Phase 2B Scanned PDF OCR Design

## Goal

Extend the existing Book Deep Reading PDF ingest so that a PDF page without a reliable electronic text layer is rendered and processed by a fully local OCR fallback, then included in the same Schema-valid `book-source.json` artifact.

Phase 2B does not perform LLM deep reading, external search, cloud OCR, visual-model analysis, chart or table understanding, script writing, storyboard generation, or video rendering. Those capabilities remain outside this phase.

## Supported Languages and Offline Guarantee

OCR supports Simplified Chinese, Japanese, and English using Tesseract language codes `chi_sim`, `jpn`, and `eng`.

The application declares exact dependencies on `tesseract.js` and the three `@tesseract.js-data/*` packages. At runtime it prepares one ignored local language-data directory from the installed packages and supplies that directory explicitly as Tesseract's `langPath`. The worker uses local package code and local compressed traineddata only. It must not use a CDN, cloud OCR endpoint, remote URL, or runtime language download.

Failure to locate or initialize the installed worker, core, or any required language data is a fatal ingest error with a clear local-OCR message. It must not fall back to a network resource.

## Page Classification

Every PDF page is evaluated independently in true one-based PDF order.

A native text layer is reliable when its normalized content contains at least four Unicode letters or digits and no more than ten percent replacement or control characters. A reliable native page follows the existing Phase 2A path without rendering or OCR. Its block ordering, text normalization, confidence, page references, and IDs remain unchanged.

A page with no native text, fewer than four meaningful characters, or excessive invalid characters is classified as requiring OCR fallback. Sparse native text is retained only if OCR produces no accepted lines; this preserves real PDF text without presenting it as a successful OCR result. Such a page remains low confidence and records a warning.

The artifact `document.pdfKind` is:

- `digital` when no page requires OCR fallback;
- `scanned` when every page requires OCR fallback;
- `mixed` when the document contains both reliable native pages and OCR-fallback pages.

## PDF Rasterization

PDF.js remains the PDF parser. An OCR-fallback page is rendered at a deterministic scale using the locally installed `@napi-rs/canvas` implementation. Rendering is only an OCR preprocessing step; Phase 2B does not interpret pictures, figures, charts, tables, diagrams, or formulas.

The rendered page image is passed directly to one reusable local Tesseract worker. The worker is created only if at least one page needs OCR and is always terminated in a `finally` path.

## OCR Blocks and Confidence

Tesseract `blocks` output is enabled explicitly. Recognized lines are normalized for whitespace, ordered by their OCR bounding boxes from top to bottom and left to right, and converted into source blocks.

Each accepted OCR block stores:

- the true one-based PDF `page`;
- `blockId` as `p<page>-b<ordinal>` in stable sorted order;
- `originalText` containing only the OCR result, with deterministic whitespace normalization;
- a locally detected `language` of `zh-CN`, `ja`, `en`, or inherited document language when the line has insufficient script evidence;
- an OCR bounding box converted deterministically to the PDF page coordinate space;
- `confidence` converted from Tesseract's `0..100` score to the Schema's `0..1` range.

An OCR line below `0.50` confidence is discarded. Its characters are not corrected, completed, inferred, or written to `originalText`. A page with no accepted OCR lines retains its true page entry with an empty `contentBlocks` array.

OCR does not create translations or visual elements.

## Low-Confidence Reporting

For each OCR-fallback page, page confidence is the arithmetic mean of accepted line confidence values. It is `0` when no OCR line is accepted.

An OCR page whose confidence is below `0.85` is added exactly once to `extractionQuality.lowConfidencePages` with a reason that identifies local OCR fallback and the confidence threshold. Every OCR-fallback page receives a warning that states OCR was used. Low-confidence pages receive an additional warning; a page with no accepted text receives a warning that no readable text was invented.

`extractionQuality.overallConfidence` is the mean of per-page confidence: `0.99` for reliable native pages and the calculated OCR confidence for OCR-fallback pages.

## Structure Detection

Outline destinations remain the strongest chapter evidence. Existing conservative chapter-heading recognition runs over the combined accepted native and OCR lines. OCR text below the acceptance threshold cannot create chapter boundaries.

When no reliable boundary exists, the existing single fallback chapter spans the document and records the existing explicit warning. All output blocks reference an existing chapter whose range contains the real PDF page.

## Components

- `src/research/book/local-ocr.ts` owns local traineddata preparation, worker creation, OCR recognition, confidence normalization, and worker cleanup.
- `src/research/book/pdf-page-render.ts` owns deterministic PDF-page rasterization through `@napi-rs/canvas`.
- `src/research/book/pdf-ingest.ts` owns native-text reliability classification, per-page routing, combined structure detection, document-kind selection, quality reporting, and final `BookSourceSchema` validation.
- `scripts/book-ingest.ts` keeps the existing public command and canonical artifact persistence behavior.
- `tests/book-scanned-pdf-ingest.test.ts` owns the scanned fixture contract and real local OCR integration coverage.
- Existing Phase 2A tests remain authoritative for the electronic PDF path.

## Fixture and Automated Tests

Add a small two-page scanned PDF fixture containing raster images rather than a PDF text layer:

- page 1 contains large, clear Simplified Chinese, Japanese, and English text, including a conservative chapter heading;
- page 2 contains no reliably readable text, proving that the ingest retains the page, reports zero/low confidence, and does not invent a block.

Tests verify:

- the fixture has no usable native PDF text layer;
- both real PDF pages use OCR fallback;
- `document.pdfKind` is `scanned`;
- page 1 produces stable, unique, page-prefixed OCR block IDs and multilingual original text;
- block confidence is within `0..1` and accepted blocks are at least `0.50`;
- page 2 is present with no invented content;
- page 2 appears in `lowConfidencePages` and warnings;
- chapter and page references are valid;
- the artifact passes the existing `BookSourceSchema`;
- rerunning the same fixture produces identical page/block content and IDs;
- the existing digital fixture still takes the pure Phase 2A path with identical page count, block count, text, confidence, and `pdfKind: digital`;
- the CLI persists both electronic and scanned artifacts to their canonical output paths.

## Acceptance

Final acceptance runs:

```bash
npm run typecheck
npm test
npm run book:validate-demo
npm run book:ingest -- tests/fixtures/digital-book.pdf
npm run book:ingest -- tests/fixtures/scanned-book.pdf
```

All five commands must exit `0`. The generated scanned `book-source.json` must pass the current Schema and report the real page count, OCR page count, block count, confidence, low-confidence page, warnings, and valid page/block/chapter references.
