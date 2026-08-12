# Book Deep Reading Phase 2B Scanned PDF OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully local OCR fallback for PDF pages without a reliable electronic text layer while preserving the existing Phase 2A digital path.

**Architecture:** PDF.js first extracts every page's native text. Only unreliable pages are rendered through `@napi-rs/canvas` and recognized by one local Tesseract worker using installed `chi_sim`, `jpn`, and `eng` data; the combined page results continue through the existing structure builder and `BookSourceSchema` gate.

**Tech Stack:** Node.js 22+, TypeScript, PDF.js 6.2.108, `@napi-rs/canvas` 1.0.5, Tesseract.js 7.0.0, local `@tesseract.js-data/*` 1.0.0 packages, Zod, Vitest.

## Global Constraints

- Add scanned-page OCR fallback only.
- Do not add cloud OCR, runtime network downloads, LLM deep reading, external search, video work, or Phase 2C visual understanding.
- Support Simplified Chinese, Japanese, and English from locally installed language data.
- Preserve true one-based PDF pages, stable page-prefixed block IDs, OCR original text, bounding boxes, and confidence.
- Discard OCR lines below `0.50`; never repair, complete, or invent unreadable content.
- Add OCR page confidence below `0.85` to `lowConfidencePages` and warnings.
- Preserve the exact Phase 2A route for reliable electronic-text pages.
- Validate and atomically persist through the existing `BookSourceSchema` and artifact store.
- Create exactly one final commit named `feat: add scanned PDF OCR fallback`.

---

### Task 1: Deterministic scanned-page rasterization

**Files:**
- Create: `tests/fixtures/scanned-book.pdf`
- Create: `tests/pdf-page-render.test.ts`
- Create: `src/research/book/pdf-page-render.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `PDFPageProxy` from `pdfjs-dist/legacy/build/pdf.mjs`.
- Produces: `renderPdfPageForOcr(page: PDFPageProxy): Promise<{png: Buffer; width: number; height: number; pdfWidth: number; pdfHeight: number}>`.

- [ ] **Step 1: Add the static two-page scanned PDF fixture and failing render test**

Create a small ASCII-safe PDF whose pages contain raster-image XObjects and no PDF text operators. Page 1's image contains large `Chapter 1`, Simplified Chinese, Japanese, and English lines. Page 2 contains a blank/noisy raster with no readable text.

The test independently opens the fixture with PDF.js, verifies `numPages === 2` and both `getTextContent()` results have no non-empty strings, then imports the wished-for renderer:

```ts
const rendered = await renderPdfPageForOcr(await document.getPage(1));
expect(rendered.png.subarray(1, 4).toString("ascii")).toBe("PNG");
expect(rendered.width).toBeGreaterThan(1_000);
expect(rendered.height).toBeGreaterThan(1_000);
expect(rendered.pdfWidth).toBe(612);
expect(rendered.pdfHeight).toBe(792);
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npx vitest run tests/pdf-page-render.test.ts`

Expected: FAIL because `src/research/book/pdf-page-render.ts` does not exist.

- [ ] **Step 3: Install exact local rendering and OCR dependencies**

Run:

```bash
npm install --save-exact @napi-rs/canvas@1.0.5 tesseract.js@7.0.0 @tesseract.js-data/eng@1.0.0 @tesseract.js-data/chi_sim@1.0.0 @tesseract.js-data/jpn@1.0.0
```

Expected: all five packages are direct dependencies and the lockfile resolves them without remote runtime configuration.

- [ ] **Step 4: Implement minimal deterministic rasterization**

```ts
export const renderPdfPageForOcr = async (page: PDFPageProxy) => {
  const pdfViewport = page.getViewport({scale: 1});
  const renderViewport = page.getViewport({scale: 2.5});
  const canvas = createCanvas(Math.ceil(renderViewport.width), Math.ceil(renderViewport.height));
  const context = canvas.getContext("2d");
  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport: renderViewport,
  }).promise;
  return {
    png: canvas.toBuffer("image/png"),
    width: canvas.width,
    height: canvas.height,
    pdfWidth: pdfViewport.width,
    pdfHeight: pdfViewport.height,
  };
};
```

- [ ] **Step 5: Run targeted GREEN**

Run: `npx vitest run tests/pdf-page-render.test.ts`

Expected: the real scanned fixture has two pages, no text layer, and renders to a non-empty PNG.

---

### Task 2: Fully local multilingual OCR engine

**Files:**
- Create: `tests/local-ocr.test.ts`
- Create: `src/research/book/local-ocr.ts`

**Interfaces:**
- Consumes: rendered PNG bytes and dimensions from Task 1.
- Produces: `OcrLine = {text: string; confidence: number; bbox: [number, number, number, number]}`.
- Produces: `LocalOcrEngine = {recognize(png: Buffer): Promise<OcrLine[]>; terminate(): Promise<void>}`.
- Produces: `createLocalOcrEngine(): Promise<LocalOcrEngine>`.
- Produces: `prepareLocalOcrLanguageData(): Promise<string>`.

- [ ] **Step 1: Write failing local-data and real-recognition tests**

The local-data test calls `prepareLocalOcrLanguageData()` and verifies that the returned directory contains exactly the installed `chi_sim.traineddata.gz`, `jpn.traineddata.gz`, and `eng.traineddata.gz` resources.

The recognition test renders scanned fixture page 1, creates one real worker, recognizes the PNG, terminates in `finally`, and asserts independently observable behavior:

```ts
const lines = await engine.recognize(rendered.png);
expect(lines.map((line) => line.text).join(" ")).toContain("Chapter 1");
expect(lines.some((line) => /[\p{Script=Han}]/u.test(line.text))).toBe(true);
expect(lines.some((line) => /[\u3040-\u30ff]/u.test(line.text))).toBe(true);
expect(lines.every((line) => line.confidence >= 0.5 && line.confidence <= 1)).toBe(true);
expect(lines).toEqual([...lines].sort(byTopThenLeft));
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npx vitest run tests/local-ocr.test.ts`

Expected: FAIL because `src/research/book/local-ocr.ts` does not exist.

- [ ] **Step 3: Implement installed language-data staging**

Resolve each package through `createRequire(import.meta.url)`, load its `{code, gzip, langPath}` descriptor, and copy its exact compressed traineddata into `.cache/book-ocr/tessdata-v1`. Reject a missing descriptor or source file. Do not accept HTTP(S) paths.

```ts
const LANGUAGE_PACKAGES = [
  "@tesseract.js-data/chi_sim",
  "@tesseract.js-data/jpn",
  "@tesseract.js-data/eng",
] as const;
```

- [ ] **Step 4: Implement one reusable Tesseract worker**

Create the worker with language array `['chi_sim', 'jpn', 'eng']`, OEM LSTM, explicit local `langPath`, `gzip: true`, and `cacheMethod: 'none'`. Enable `{blocks: true}` in `recognize`, flatten paragraph lines, normalize whitespace, convert confidence to `0..1`, discard lines below `0.50`, sort by `(bbox.y0, bbox.x0)`, and expose idempotent `terminate()`.

- [ ] **Step 5: Run targeted GREEN**

Run: `npx vitest run tests/local-ocr.test.ts tests/pdf-page-render.test.ts`

Expected: local language preparation and real tri-language OCR PASS without remote resources.

---

### Task 3: Per-page native/OCR routing and BookSource quality

**Files:**
- Create: `tests/book-scanned-pdf-ingest.test.ts`
- Modify: `src/research/book/pdf-ingest.ts`
- Modify: `tests/book-pdf-ingest.test.ts`
- Modify: `tests/book-ingest-cli.test.ts`

**Interfaces:**
- Consumes: `renderPdfPageForOcr`, `createLocalOcrEngine`, and existing native `ExtractedLine` output.
- Produces: unchanged `ingestDigitalPdf(pdfPath, options): Promise<BookSource>` public API with automatic per-page OCR fallback.
- Produces: `isReliableNativeText(lines: ExtractedLine[]): boolean` for threshold behavior coverage.

- [ ] **Step 1: Write failing scanned-ingest integration tests**

Run the real `ingestDigitalPdf` API on `scanned-book.pdf` with a fixed `createdAt` and assert:

```ts
expect(BookSourceSchema.parse(source)).toEqual(source);
expect(source.metadata.pageCount).toBe(2);
expect(source.document.pdfKind).toBe("scanned");
expect(source.pages.map((page) => page.page)).toEqual([1, 2]);
expect(source.pages[0]?.contentBlocks.length).toBeGreaterThan(0);
expect(source.pages[1]?.contentBlocks).toEqual([]);
expect(source.extractionQuality.lowConfidencePages).toContainEqual({
  page: 2,
  confidence: 0,
  reason: expect.stringContaining("local OCR"),
});
expect(source.extractionQuality.warnings.some((warning) => warning.includes("page 2"))).toBe(true);
```

Also verify every OCR block uses its true page prefix, has confidence `>= 0.50`, cites a covering chapter, preserves multilingual OCR output, and two ingests return identical pages after excluding `artifact.createdAt`.

- [ ] **Step 2: Add an explicit digital non-regression assertion and verify RED**

Extend the existing electronic test to assert `pdfKind: digital`, four blocks, exact existing text, all confidence `0.99`, and no OCR warnings.

Run: `npx vitest run tests/book-scanned-pdf-ingest.test.ts tests/book-pdf-ingest.test.ts`

Expected: scanned fixture FAILS with the existing Phase 2A digital-text-only error; digital fixture remains GREEN.

- [ ] **Step 3: Refactor native extraction into page candidates without behavior changes**

Add `isReliableNativeText` using at least four Unicode letters/digits and at most ten percent replacement/control characters. Preserve current native line objects and `0.99` confidence. Keep page ordering unchanged.

- [ ] **Step 4: Add lazy OCR fallback and quality aggregation**

For each unreliable page: lazily create the worker, render, recognize, map image coordinates back to PDF coordinates, and use accepted OCR lines. If OCR has no accepted lines but sparse native text exists, retain native lines and mark confidence low. Track OCR-routed page numbers separately from accepted blocks.

Build:

```ts
const pdfKind = ocrPages.length === 0
  ? "digital"
  : ocrPages.length === document.numPages
    ? "scanned"
    : "mixed";
```

Calculate each OCR page mean confidence, add values below `0.85` to `lowConfidencePages`, add page-specific warnings, and calculate overall confidence from all page confidence values. Always terminate the worker and destroy the PDF loading task.

- [ ] **Step 5: Run targeted GREEN and CLI persistence coverage**

Extend `tests/book-ingest-cli.test.ts` to run the scanned fixture and read `output/scanned-book/book/book-source.json` through `BookSourceSchema`.

Run:

```bash
npx vitest run tests/book-scanned-pdf-ingest.test.ts tests/book-pdf-ingest.test.ts tests/book-ingest-cli.test.ts tests/local-ocr.test.ts tests/pdf-page-render.test.ts
```

Expected: scanned, digital, quality, stability, and both CLI paths PASS.

---

### Task 4: Exact acceptance and one commit

**Files:**
- Include the approved Spec, this plan, exact dependencies, production files, tests, and fixtures in one commit.
- Modify no LLM, search, script, storyboard, render, chart, or table-understanding file.

**Interfaces:**
- Consumes the unchanged `npm run book:ingest -- <pdf-path>` command.
- Produces one pushed Phase 2B commit on `main`.

- [ ] **Step 1: Run exact final acceptance in order**

```bash
npm run typecheck
npm test
npm run book:validate-demo
npm run book:ingest -- tests/fixtures/digital-book.pdf
npm run book:ingest -- tests/fixtures/scanned-book.pdf
```

Expected: all commands exit `0`; full tests have zero failures; digital output remains two pages/four blocks; scanned output reports two OCR pages and a positive accepted block count.

- [ ] **Step 2: Verify generated scanned artifact contract**

Read `output/scanned-book/book/book-source.json` through `BookSourceSchema` in automated tests and confirm page set `[1, 2]`, valid page/block/chapter references, page 2 low confidence, and no invented page 2 text.

- [ ] **Step 3: Audit scope and working tree**

Run `git diff --check`, inspect every changed path, confirm output/cache files are ignored, and confirm no prohibited Phase 2C, LLM, search, or video work exists.

- [ ] **Step 4: Create the only commit**

```bash
git add docs/superpowers/specs/2026-08-12-book-deep-reading-phase-2b-scanned-pdf-ocr-design.md docs/superpowers/plans/2026-08-12-book-deep-reading-phase-2b-scanned-pdf-ocr.md package.json package-lock.json src/research/book/local-ocr.ts src/research/book/pdf-page-render.ts src/research/book/pdf-ingest.ts tests/fixtures/scanned-book.pdf tests/pdf-page-render.test.ts tests/local-ocr.test.ts tests/book-scanned-pdf-ingest.test.ts tests/book-pdf-ingest.test.ts tests/book-ingest-cli.test.ts
git commit -m "feat: add scanned PDF OCR fallback"
```

- [ ] **Step 5: Fast-forward `main`, verify final status, and push**

Fast-forward the implementation branch to `main`, rerun the full test suite on the merged tree, then run `git push origin main`. Remove only the owned Phase 2B worktree/branch after successful integration.
