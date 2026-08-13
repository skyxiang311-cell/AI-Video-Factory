import type {ChapterAnalysis} from "./knowledge-schema";

export class ChapterDeepReadOutputError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Chapter deep-read provider output is invalid: ${issues.join("; ")}`);
    this.name = "ChapterDeepReadOutputError";
    this.issues = issues;
  }
}

export interface ChapterDeepReadBlock {
  blockId: string;
  page: number;
  chapterId: string;
  type: string;
  originalText: string;
  language: string;
  confidence: number;
}

export interface ChapterDeepReadInput {
  chapterId: string;
  title: string;
  chapterRole: string;
  chapterSummary: string;
  importance: number;
  targetPriority: number;
  targetReason: string;
  chapterCatalog: Array<{chapterId: string; title: string}>;
  blocks: ChapterDeepReadBlock[];
}

export interface ChapterDeepReadProvider {
  readonly provider: string;
  readonly model: string;
  analyzeChapter(
    input: ChapterDeepReadInput,
    qualityFeedback?: string[],
  ): Promise<ChapterAnalysis>;
}
