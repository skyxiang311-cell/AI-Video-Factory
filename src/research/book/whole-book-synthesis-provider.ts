import type {BookSourceRef} from "./common-schema";
import type {InterrogativeDeepRead} from "./interrogative-deep-read-schema";
import type {WholeBookArgumentSynthesis} from "./whole-book-argument-synthesis-schema";

export interface WholeBookSynthesisClaimInput {
  claimId: string;
  chapterId: string;
  statement: string;
  authorPosition: string;
  scope: {appliesTo: string[]; doesNotNecessarilyApplyTo: string[]};
  importance: number;
  evidenceSummaries: string[];
  limitations: string[];
  sourceRefs: BookSourceRef[];
}

export interface WholeBookSynthesisInput {
  map: {
    coreProblem: string;
    candidateCoreTheses: string[];
    structureOverview: string;
    recurringConcepts: string[];
  };
  chapters: Array<{
    chapterId: string;
    title: string;
    importance: number;
    summary: string;
    role: string;
  }>;
  claims: WholeBookSynthesisClaimInput[];
  deepReads: InterrogativeDeepRead[];
}

export interface WholeBookSynthesisProvider {
  readonly provider: string;
  readonly model: string;
  synthesize(input: WholeBookSynthesisInput): Promise<WholeBookArgumentSynthesis>;
}
