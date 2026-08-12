# Book Deep Reading Phase 2A Digital PDF Ingest Design

## Goal

Convert a copyable-text electronic PDF into a validated `book-source.json` artifact at `output/<job-id>/book/book-source.json`.

Phase 2A ends after source extraction. It does not perform OCR, scanned-PDF recovery, visual-model analysis, LLM analysis, external research, chapter analysis, angle selection, script writing, storyboard generation, or video rendering.

## Input and Command

The public command is:

```bash
npm run book:ingest -- <pdf-path>
```

The PDF path is required and must point to a readable `.pdf` file. The job ID is derived deterministically from the PDF filename without its extension, normalized to a safe lowercase path segment. An invalid or empty normalized filename is rejected. Existing artifact-path safety checks remain authoritative.

The command exits non-zero for a missing file, malformed PDF, encrypted or otherwise unreadable PDF, a PDF without a usable electronic text layer, unsafe job ID, extraction failure, or Schema validation failure.

## PDF Engine

Use `pdfjs-dist` as an in-process parser. It reads the document page count, page text content, item coordinates, document metadata, and PDF outline without requiring a separately installed command-line program.

No OCR fallback is allowed. A document whose pages do not provide usable text is rejected with an error that states Phase 2A supports digital text PDFs only.

## Extraction Model

Pages are processed in true PDF order using one-based page numbers. Every page from `1` through `pageCount` appears exactly once in `pages`, including a page that contains no text.

Text items are normalized in a deterministic order based on their PDF position. Items on the same visual line are joined, and stable non-empty lines are converted into content blocks. Each block stores:

- `blockId` in the form `p<page>-b<ordinal>`;
- the true one-based PDF `page`;
- the assigned `chapterId`;
- a conservative block `type` such as `heading`, `list`, or `paragraph`;
- unmodified extracted content in `originalText`, apart from deterministic whitespace normalization between PDF text items;
- an initial `language` classification;
- the union bounding box of its text items;
- a high confidence value appropriate for a PDF electronic text layer.

Block ordering and IDs depend only on the extracted page content and coordinates, so ingesting the same PDF with the same parser version produces the same blocks.

The SHA-256 digest is calculated from the original PDF bytes before parsing and stored as lowercase hexadecimal in `document.sha256`.

## Language Detection

Language detection is deterministic and local. Hiragana or Katakana indicates Japanese; Han characters without Japanese kana indicate Chinese; Latin-letter text indicates English. Mixed documents retain every detected language in stable order. If a block has insufficient script evidence, it inherits the dominant document language.

No translation is generated during ingest.

## Structure Detection and Fallback

Chapter boundaries use only evidence present in the PDF:

1. Prefer valid top-level PDF outline entries whose destinations resolve to ordered page numbers.
2. If no usable outline exists, apply conservative heading recognition to extracted text, accepting only explicit chapter-style headings such as numbered `Chapter`, `第…章`, or `第…章` Japanese forms.
3. Record detected table-of-contents markers such as `Contents`, `目录`, or `目次` as structural evidence, but do not treat a contents entry as a chapter unless its destination is reliable.

When reliable chapter boundaries cannot be found, use one neutral fallback chapter named after the document and spanning pages `1..pageCount`. A warning explicitly states that no reliable chapter boundaries were detected and that the chapter is a fallback container. This container satisfies `BookSourceSchema` references without claiming an inferred real chapter.

Every content block references an existing chapter whose page range contains the block page.

## Metadata and Quality

Use PDF metadata for title and authors when present. Otherwise, use the source filename as the title and `Unknown` as the required author placeholder, with a warning that author metadata was unavailable. Missing optional publisher and publication year remain absent.

`document.pdfKind` is always `digital`. Electronic text blocks receive reliable high confidence. Empty pages are preserved and listed in extraction warnings; a document with no usable text across all pages is rejected rather than mislabeled as successfully ingested.

The complete artifact must pass `BookSourceSchema.parse()` before it is written. Writing uses the existing validated, atomic artifact-store path.

## Components

- `src/research/book/pdf-ingest.ts` owns PDF byte hashing, parsing, per-page extraction, language detection, structure detection, and creation of a `BookSource` value.
- `scripts/book-ingest.ts` owns CLI argument validation, deterministic job-ID derivation, validated persistence, concise success output, and non-zero error handling.
- `tests/book-pdf-ingest.test.ts` owns the small digital-PDF fixture and extraction contract tests.
- `tests/book-ingest-cli.test.ts` owns command-level output path, persistence, and failure behavior.
- `package.json` exposes `book:ingest` and declares the PDF parser dependency.

## Testing

A very small, generated electronic PDF fixture contains multiple pages and extractable text. Language-detector tests separately cover representative Chinese, Japanese, and English text without requiring a large multilingual font fixture. Automated tests verify:

- the real PDF page count;
- extracted text on the expected pages;
- stable and unique block IDs;
- true page numbers and page-prefixed block IDs;
- valid block-to-chapter references;
- the original file SHA-256;
- initial language detection;
- reliable fallback warnings when chapter evidence is absent;
- successful `BookSourceSchema` parsing;
- persistence to `output/<job-id>/book/book-source.json`;
- rejection of a PDF without usable electronic text.

Final acceptance runs only:

```bash
npm run typecheck
npm test
npm run book:validate-demo
npm run book:ingest -- <test-pdf>
```

The existing Knowledge Demo and Book Deep Reading Phase 1 behavior must remain unchanged.
