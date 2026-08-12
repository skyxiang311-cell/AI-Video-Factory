# Book Deep Reading Phase 2A Digital PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert a copyable-text digital PDF into a Schema-valid `output/<job-id>/book/book-source.json` artifact.

**Architecture:** `pdfjs-dist` parses PDF bytes in-process. A focused ingest module converts native pages, text items, metadata, and outline evidence into the existing `BookSource` contract; a separate CLI derives a safe job ID and persists the validated artifact through the Phase 1 artifact store.

**Tech Stack:** Node.js 22+, TypeScript, `pdfjs-dist` 6.2.108, Zod, Vitest, existing atomic JSON storage.

## Global Constraints

- Implement Phase 2A digital/copyable-text PDF ingest only.
- Do not add OCR, scanned-PDF recovery, visual models, LLMs, external search, or video scripts.
- Preserve true one-based PDF page numbers and stable content-block IDs.
- Never invent chapter boundaries; use evidence-based boundaries or an explicit warning-backed fallback container.
- Validate all output with the existing `BookSourceSchema` before persistence.
- Write only to `output/<job-id>/book/book-source.json`.
- Preserve the Knowledge Demo and all Phase 1 behavior.

---

### Task 1: Digital PDF extraction contract

**Files:**
- Create: `tests/fixtures/digital-book.pdf`
- Create: `tests/book-pdf-ingest.test.ts`
- Create: `src/research/book/pdf-ingest.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `detectBookTextLanguage(text: string): "zh-CN" | "ja" | "en" | "und"`
- Produces: `ingestDigitalPdf(pdfPath: string, options?: {createdAt?: string}): Promise<BookSource>`
- Consumes: `BookSourceSchema` and `BookSource` from `src/research/book/source-schema.ts`

- [ ] **Step 1: Add the real two-page digital PDF fixture and failing extraction tests**

The fixture is a minimal valid PDF with a native text layer, two pages, title/author metadata, a clear `Chapter 1` heading, and ordinary English paragraphs. Tests call the public ingest API and assert hand-derived values:

```ts
const source = await ingestDigitalPdf(fixturePath, {
  createdAt: "2026-08-12T00:00:00.000Z",
});

expect(BookSourceSchema.parse(source)).toEqual(source);
expect(source.metadata).toMatchObject({pageCount: 2, title: "Phase 2A Test Book"});
expect(source.document.sha256).toMatch(/^[a-f0-9]{64}$/);
expect(source.pages.map((page) => page.page)).toEqual([1, 2]);
expect(source.pages[0]?.contentBlocks.map((block) => block.originalText).join(" "))
  .toContain("Chapter 1");
expect(new Set(blocks.map((block) => block.blockId)).size).toBe(blocks.length);
expect(blocks.every((block) => block.blockId.startsWith(`p${block.page}-`))).toBe(true);
expect(detectBookTextLanguage("中文段落")).toBe("zh-CN");
expect(detectBookTextLanguage("日本語の文章")).toBe("ja");
expect(detectBookTextLanguage("English paragraph")).toBe("en");
```

Include a textless one-page PDF variant in test setup and assert rejection with a digital-text-only error.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npx vitest run tests/book-pdf-ingest.test.ts`

Expected: FAIL because `src/research/book/pdf-ingest.ts` does not exist.

- [ ] **Step 3: Install the exact parser dependency**

Run: `npm install --save-exact pdfjs-dist@6.2.108`

Expected: `package.json` and `package-lock.json` record the exact compatible version.

- [ ] **Step 4: Implement the minimal parser and BookSource builder**

Implement `pdf-ingest.ts` with these focused internal stages:

```ts
export const detectBookTextLanguage = (text: string): "zh-CN" | "ja" | "en" | "und" => {
  if (/[\u3040-\u30ff]/u.test(text)) return "ja";
  if (/\p{Script=Han}/u.test(text)) return "zh-CN";
  if (/\p{Script=Latin}/u.test(text)) return "en";
  return "und";
};

export const ingestDigitalPdf = async (
  pdfPath: string,
  options: {createdAt?: string} = {},
): Promise<BookSource> => {
  const bytes = await readFile(pdfPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const document = await getDocument({data: new Uint8Array(bytes), useWorkerFetch: false}).promise;
  // Extract every page, build stable blocks, resolve outline/heading chapters,
  // assign block chapter references, then parse through BookSourceSchema.
  return BookSourceSchema.parse(candidate);
};
```

Use native PDF item coordinates to group same-line items and create deterministic `p<page>-b<ordinal>` IDs. Use top-level outline destinations first, explicit chapter headings second, and a single warning-backed fallback container otherwise. Reject documents with zero usable text blocks.

- [ ] **Step 5: Run targeted GREEN and refactor only while green**

Run: `npx vitest run tests/book-pdf-ingest.test.ts`

Expected: all extraction and language tests PASS with no OCR path.

---

### Task 2: CLI persistence contract

**Files:**
- Create: `tests/book-ingest-cli.test.ts`
- Create: `scripts/book-ingest.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ingestDigitalPdf(pdfPath)`
- Consumes: `getBookArtifactPaths(jobId)` and `writeValidatedJson(path, BookSourceSchema, data)`
- Produces: `deriveBookIngestJobId(pdfPath: string): string`
- Produces: `runBookIngestCli(options?: {argv?: string[]; stdout?: (message: string) => void; stderr?: (message: string) => void}): Promise<number>`

- [ ] **Step 1: Write failing real-filesystem CLI tests**

Run the exported CLI function from a temporary working directory against the real fixture. Assert:

```ts
const exitCode = await runBookIngestCli({
  argv: [fixturePath],
  stdout: (message) => stdout.push(message),
  stderr: (message) => stderr.push(message),
});

expect(exitCode).toBe(0);
const outputPath = resolve("output/digital-book/book/book-source.json");
const persisted = BookSourceSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
expect(persisted.metadata.pageCount).toBe(2);
expect(persisted.pages.flatMap((page) => page.contentBlocks).length).toBeGreaterThan(0);
```

Also assert a missing argument and a non-PDF extension return `1` without writing an artifact. Restore `process.cwd()` and delete only the test-created temporary directory in `afterEach`.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npx vitest run tests/book-ingest-cli.test.ts`

Expected: FAIL because `scripts/book-ingest.ts` does not exist.

- [ ] **Step 3: Implement the minimal CLI**

```ts
export const deriveBookIngestJobId = (pdfPath: string): string => {
  const stem = basename(pdfPath, extname(pdfPath)).toLowerCase();
  const jobId = stem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!jobId) throw new Error("PDF filename must contain a safe job id");
  return jobId;
};

export const runBookIngestCli = async ({
  argv = process.argv.slice(2),
  stdout = console.log,
  stderr = console.error,
} = {}): Promise<number> => {
  // Validate one .pdf argument, ingest, persist using the canonical artifact path,
  // print JSON with jobId/outputPath/pageCount/blockCount, return 0; catch and return 1.
};
```

Add `"book:ingest": "tsx scripts/book-ingest.ts"` to `package.json`.

- [ ] **Step 4: Run targeted GREEN**

Run: `npx vitest run tests/book-ingest-cli.test.ts tests/book-pdf-ingest.test.ts`

Expected: all Phase 2A tests PASS.

---

### Task 3: Regression and acceptance

**Files:**
- Modify only files already listed if verification reveals a Phase 2A defect; every defect requires a new failing regression test before its fix.

**Interfaces:**
- Consumes the completed `book:ingest` command and existing Phase 1 validation demo.
- Produces the final committed and pushed Phase 2A implementation.

- [ ] **Step 1: Run the exact acceptance sequence**

Run, in order:

```bash
npm run typecheck
npm test
npm run book:validate-demo
npm run book:ingest -- tests/fixtures/digital-book.pdf
```

Expected: all four commands exit `0`; the test suite has zero failures; CLI output reports two pages and a positive block count.

- [ ] **Step 2: Validate the generated artifact independently**

Read `output/digital-book/book/book-source.json` through `BookSourceSchema`, verify pages `[1, 2]`, non-empty extracted text, unique block IDs, and valid block-to-chapter page containment.

- [ ] **Step 3: Audit scope and working tree**

Run `git diff --check`, inspect `git status --short`, and confirm no OCR, vision-model, LLM, external-search, script, storyboard, or render code was introduced. Confirm generated `output/` artifacts are ignored.

- [ ] **Step 4: Commit the implementation**

```bash
git add package.json package-lock.json src/research/book/pdf-ingest.ts scripts/book-ingest.ts tests/book-pdf-ingest.test.ts tests/book-ingest-cli.test.ts tests/fixtures/digital-book.pdf docs/superpowers/plans/2026-08-12-book-deep-reading-phase-2a-digital-pdf.md
git commit -m "feat: ingest digital PDF books"
```

- [ ] **Step 5: Integrate and push**

Fast-forward `main` to the implementation branch, verify final `git status`, and run `git push origin main`.
