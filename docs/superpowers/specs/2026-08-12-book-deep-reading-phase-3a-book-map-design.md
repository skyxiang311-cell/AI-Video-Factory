# Book Deep Reading Phase 3A Book Map Design

## Scope

Phase 3A implements Round 1 whole-book overview analysis only. It reads an existing `book-source.json` and writes `output/<job-id>/book/book-map.json`. It does not perform chapter-level Claim or Evidence deep reading, external search, verification, script writing, storyboard work, or video production.

## Output Contract

`book-map.json` uses a dedicated `BookMapSchema` and declares `analysisLanguage: "zh-CN"`. It records:

- the core problem the book addresses;
- possible core theses, explicitly marked as candidates rather than verified Claims;
- a structured whole-book overview;
- every source chapter's role, summary, importance from 0 to 100, and `deepReadPriority`;
- recurring concepts and the chapters in which they appear;
- recommended Phase 3B target chapters and reasons;
- pages excluded because of low-confidence extraction;
- artifact, provider, model, prompt, Schema, and creation metadata.

Every substantive judgment carries one or more `book` source references containing `chapterId`, true PDF `page`, and `blockId`. A cross-artifact validator confirms that every reference resolves to the input source, belongs to the stated chapter and page, and is not excluded from analysis. The chapter map must cover every source chapter exactly once. Phase 3B recommendations may only cite mapped source chapters.

## Input Safety

The LLM receives a deterministic evidence pack assembled from the book metadata, chapter structure, and eligible content blocks. A block is excluded when its page appears in `extractionQuality.lowConfidencePages` or its own confidence is below `0.85`. Excluded OCR content is never supplied as evidence and therefore cannot support a core problem, candidate thesis, recurring concept, chapter judgment, or Phase 3B recommendation.

The system prompt requires Simplified Chinese analysis, prohibits outside facts, prohibits filling gaps, and requires all conclusions to cite only provided source references. Visual elements are not semantically interpreted in Phase 3A.

## Provider Boundary

Business logic depends only on `BookMapProvider`. The first adapter uses the OpenAI Responses API with strict Structured Outputs. It reads `OPENAI_API_KEY` and `OPENAI_BOOK_MAP_MODEL` from the environment. Missing configuration fails clearly. No API key, endpoint, or fixed model identifier is stored in source files or artifacts.

The adapter owns HTTP request and response parsing. The Book Map service owns evidence filtering, prompt-version selection, Schema parsing, traceability validation, caching, and persistence. Tests use an injected synthetic provider and never call a real API.

## Cache

The cache fingerprint includes the complete validated `book-source.json` content, prompt version, Schema version, provider, and model. An existing `book-map.json` is reused only when its metadata matches the expected fingerprint and it still passes both `BookMapSchema` and cross-artifact reference validation. A source, prompt, Schema, provider, or model change causes one new provider call and atomically replaces the artifact.

## CLI and Verification

`npm run book:map -- <job-id>` reads the canonical source artifact, constructs the configured provider adapter, creates or reuses the Book Map, and reports provider, analyzed chapter count, cache status, and output path.

A synthetic two-chapter fixture verifies Simplified Chinese output, complete chapter coverage, importance and priority, recurring concepts, Phase 3B recommendations, valid source references, low-confidence exclusion, cache hits, cache invalidation, adapter configuration, and CLI persistence.
