import type {
  MiniChapterEvidence,
  MiniChapterMap,
  WholeBookSynthesis,
  WholeBookSynthesisInput,
} from "./book-map-stages";

export interface BookMapProvider {
  readonly provider: string;
  readonly model: string;
  analyzeChapter(input: MiniChapterEvidence): Promise<MiniChapterMap>;
  synthesize(
    input: WholeBookSynthesisInput,
    qualityFeedback?: string[],
  ): Promise<WholeBookSynthesis>;
}
