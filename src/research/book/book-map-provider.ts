import type {BookMapDraft} from "./book-map-schema";
import type {BookMapEvidencePack} from "./book-map-input";

export interface BookMapProvider {
  readonly provider: string;
  readonly model: string;
  analyze(input: BookMapEvidencePack): Promise<BookMapDraft>;
}
