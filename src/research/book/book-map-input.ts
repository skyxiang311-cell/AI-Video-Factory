import type {BookMap} from "./book-map-schema";
import type {BookSourceRef} from "./common-schema";
import type {BookSource} from "./source-schema";

export const MINIMUM_BOOK_MAP_BLOCK_CONFIDENCE = 0.85;

export interface BookMapEvidenceBlock {
  blockId: string;
  page: number;
  chapterId: string;
  type: string;
  originalText: string;
  language: string;
  confidence: number;
}

export interface BookMapEvidencePack {
  metadata: BookSource["metadata"];
  structure: BookSource["structure"];
  chapters: Array<{
    chapterId: string;
    title: string;
    startPage: number;
    endPage: number;
    blocks: BookMapEvidenceBlock[];
  }>;
  excludedLowConfidencePages: Array<{page: number; reason: string}>;
}

const referenceKey = (reference: BookSourceRef): string => (
  `${reference.chapterId}:${reference.page}:${reference.blockId}`
);

export const buildBookMapEvidencePack = (source: BookSource): BookMapEvidencePack => {
  const excludedPages = new Set(
    source.extractionQuality.lowConfidencePages.map((entry) => entry.page),
  );
  const eligibleBlocks = source.pages.flatMap((page) => (
    excludedPages.has(page.page)
      ? []
      : page.contentBlocks.filter((block) => (
          block.confidence >= MINIMUM_BOOK_MAP_BLOCK_CONFIDENCE
        ))
  ));

  return {
    metadata: source.metadata,
    structure: source.structure,
    chapters: source.structure.chapters.map((chapter) => ({
      ...chapter,
      blocks: eligibleBlocks
        .filter((block) => block.chapterId === chapter.chapterId)
        .map((block) => ({
          blockId: block.blockId,
          page: block.page,
          chapterId: block.chapterId,
          type: block.type,
          originalText: block.originalText,
          language: block.language,
          confidence: block.confidence,
        })),
    })),
    excludedLowConfidencePages: source.extractionQuality.lowConfidencePages.map((entry) => ({
      page: entry.page,
      reason: entry.reason ?? "Low-confidence extraction page excluded from Book Map evidence",
    })),
  };
};

const collectMapReferences = (map: BookMap): BookSourceRef[] => [
  ...map.coreProblem.sourceRefs,
  ...map.candidateCoreTheses.flatMap((thesis) => thesis.sourceRefs),
  ...map.structureOverview.sourceRefs,
  ...map.structureOverview.parts.flatMap((part) => part.sourceRefs),
  ...map.chapters.flatMap((chapter) => chapter.sourceRefs),
  ...map.recurringConcepts.flatMap((concept) => concept.sourceRefs),
  ...map.phase3BTargets.flatMap((target) => target.sourceRefs),
];

export const validateBookMapAgainstSource = (
  source: BookSource,
  map: BookMap,
): string[] => {
  const issues: string[] = [];
  const expectedExcludedPages = buildBookMapEvidencePack(source).excludedLowConfidencePages;
  if (JSON.stringify(map.excludedLowConfidencePages) !== JSON.stringify(expectedExcludedPages)) {
    issues.push("Book Map low-confidence exclusion record differs from source");
  }
  const sourceChapters = new Map(source.structure.chapters.map((chapter) => [
    chapter.chapterId,
    chapter,
  ]));
  const mappedChapters = new Map(map.chapters.map((chapter) => [chapter.chapterId, chapter]));
  const excludedPages = new Set(
    source.extractionQuality.lowConfidencePages.map((entry) => entry.page),
  );
  const sourceBlocks = new Map<string, {confidence: number}>();
  const eligibleReferences = new Set<string>();

  for (const page of source.pages) {
    for (const block of page.contentBlocks) {
      const reference: BookSourceRef = {
        type: "book",
        chapterId: block.chapterId,
        page: block.page,
        blockId: block.blockId,
      };
      const key = referenceKey(reference);
      sourceBlocks.set(key, {confidence: block.confidence});
      if (
        !excludedPages.has(block.page)
        && block.confidence >= MINIMUM_BOOK_MAP_BLOCK_CONFIDENCE
      ) {
        eligibleReferences.add(key);
      }
    }
  }

  for (const [chapterId, sourceChapter] of sourceChapters) {
    const mapped = mappedChapters.get(chapterId);
    if (!mapped) {
      issues.push(`Missing mapped chapter: ${chapterId}`);
      continue;
    }
    if (
      mapped.title !== sourceChapter.title
      || mapped.startPage !== sourceChapter.startPage
      || mapped.endPage !== sourceChapter.endPage
    ) {
      issues.push(`Mapped chapter metadata differs from source: ${chapterId}`);
    }
    const eligibleChapterBlockCount = Array.from(eligibleReferences).filter((key) => (
      key.startsWith(`${chapterId}:`)
    )).length;
    if (eligibleChapterBlockCount === 0 && mapped.analysisStatus !== "insufficient_evidence") {
      issues.push(`Chapter ${chapterId} must use insufficient_evidence because it has no eligible blocks`);
    }
    if (mapped.sourceRefs.some((reference) => reference.chapterId !== chapterId)) {
      issues.push(`Mapped chapter ${chapterId} cites a different chapter`);
    }
  }

  for (const chapterId of mappedChapters.keys()) {
    if (!sourceChapters.has(chapterId)) issues.push(`Unknown mapped chapter: ${chapterId}`);
  }

  for (const reference of collectMapReferences(map)) {
    const key = referenceKey(reference);
    if (!sourceBlocks.has(key)) {
      issues.push(`Dangling Book Map source reference: ${reference.blockId}`);
    } else if (!eligibleReferences.has(key)) {
      issues.push(`Ineligible low-confidence Book Map source reference: ${reference.blockId}`);
    }
  }

  const knownChapterIds = new Set(sourceChapters.keys());
  for (const part of map.structureOverview.parts) {
    for (const chapterId of part.chapterIds) {
      if (!knownChapterIds.has(chapterId)) issues.push(`Unknown structure chapter: ${chapterId}`);
    }
  }
  for (const concept of map.recurringConcepts) {
    for (const chapterId of concept.chapterIds) {
      if (!knownChapterIds.has(chapterId)) {
        issues.push(`Unknown concept chapter: ${chapterId}`);
      } else if (!concept.sourceRefs.some((reference) => reference.chapterId === chapterId)) {
        issues.push(`Recurring concept ${concept.concept} lacks evidence from ${chapterId}`);
      }
    }
  }
  for (const target of map.phase3BTargets) {
    const chapter = mappedChapters.get(target.chapterId);
    if (!chapter) {
      issues.push(`Unknown Phase 3B target chapter: ${target.chapterId}`);
    } else if (chapter.analysisStatus !== "analyzed") {
      issues.push(`Insufficient-evidence chapter cannot be a Phase 3B target: ${target.chapterId}`);
    }
    if (target.sourceRefs.some((reference) => reference.chapterId !== target.chapterId)) {
      issues.push(`Phase 3B target ${target.chapterId} cites a different chapter`);
    }
  }

  return Array.from(new Set(issues));
};
