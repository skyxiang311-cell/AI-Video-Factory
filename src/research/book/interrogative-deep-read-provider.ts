import type {BookSourceRef} from "./common-schema";
import type {ChapterAnalysis} from "./knowledge-schema";
import type {InterrogativeDeepReadDraft} from "./interrogative-deep-read-schema";

export interface InterrogativeSourceBlock {
  ref: BookSourceRef;
  originalText: string;
  confidence: number;
}

export interface InterrogativeComparisonChapter {
  chapterId: string;
  title: string;
  importance: number;
  summary: string;
  claims: Array<{
    claimId: string;
    statement: string;
    sourceRefs: BookSourceRef[];
  }>;
}

export interface InterrogativeDeepReadInput {
  chapterId: string;
  title: string;
  importance: number;
  analysis: ChapterAnalysis;
  sourceBlocks: InterrogativeSourceBlock[];
  comparisonChapters: InterrogativeComparisonChapter[];
}

export interface InterrogativeDeepReadProvider {
  readonly provider: string;
  readonly model: string;
  analyzeChapter(input: InterrogativeDeepReadInput): Promise<InterrogativeDeepReadDraft>;
}
