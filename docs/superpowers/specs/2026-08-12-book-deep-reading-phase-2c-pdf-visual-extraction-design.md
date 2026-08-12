# Book Deep Reading Phase 2C PDF Visual Extraction Design

## Scope

Phase 2C extends PDF ingest to locate visual regions, crop them to local PNG files, and reference them from `book-source.json`. It does not use LLMs, visual AI, external search, deep reading, script generation, or video generation.

## Extraction Contract

PDF.js operator lists are the primary evidence. The extractor records embedded raster-image placements and bounded vector-drawing regions in true one-based PDF page order. Every accepted visual stores its true one-based `page`, a stable `p<page>-v<ordinal>` id, a PDF-coordinate bounding box, a conservative type, confidence, description, and book-directory-relative `assetPath`.

`assetPath` is optional in `BookSourceSchema` for backward compatibility with existing Phase 1 artifacts. Every newly extracted Phase 2C visual must include it. Schema validation rejects duplicate visual ids, invalid page prefixes, unsafe paths, and paths outside the current job's `book/visuals` directory. Stored paths use the exact form `visuals/<element-id>.png` and resolve relative to `output/<job-id>/book`.

## Classification

Classification uses deterministic PDF evidence only:

- embedded raster XObjects are `image` unless an explicit nearby caption identifies another supported type;
- explicit caption prefixes such as `Table`, `表`, or `表格` classify `table`;
- explicit caption prefixes such as `Chart`, `Graph`, `图表`, or `グラフ` classify `chart`;
- explicit caption prefixes such as `Diagram`, `流程图`, `示意图`, or `ダイアグラム` classify `diagram`;
- bounded vector regions without an explicit supported label use `other`;
- uncertain raster content remains `image`.

No content is inferred from pixels. Phase 2C does not attempt semantic chart, table, diagram, formula, or image understanding.

## Cropping and Persistence

Each page is rendered deterministically with the existing local canvas renderer. Visual PDF bounding boxes are mapped to rendered-image coordinates and cropped without changing the source bbox. Crops are encoded as PNG and atomically written under:

`output/<job-id>/book/visuals/<element-id>.png`

The public `book:ingest` command supplies the canonical job visual directory. Direct API callers may omit visual persistence; in that case visual extraction is skipped so no dangling `assetPath` can be produced.

## Compatibility

Reliable electronic-text pages retain the Phase 2A text path. Pages without reliable text retain the Phase 2B local OCR path. Visual extraction runs alongside either route and does not influence `pdfKind`, text blocks, OCR confidence, chapter detection, language detection, or warnings.

Full-page scan images used only to represent a scanned page are not emitted as visual elements. This prevents every scanned page from being mislabeled as a meaningful illustration. Smaller embedded images and explicitly bounded vector regions remain eligible.

## Verification

Automated tests use a deterministic complex PDF fixture with explicit image, table, chart, and diagram regions. They verify Schema parsing, stable ids, true pages, types, PDF-coordinate bboxes, safe asset paths, valid PNG crops, and unchanged digital/scanned fixture outputs. Final acceptance runs typecheck, the full test suite, Book demo validation, and ingest for digital, scanned, and complex fixtures.
