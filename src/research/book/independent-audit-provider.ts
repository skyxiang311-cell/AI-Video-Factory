import type {BookSourceRef} from "./common-schema";
import type {InterrogativeDeepRead} from "./interrogative-deep-read-schema";
import type {IndependentAuditDraft} from "./independent-audit-schema";
import type {WholeBookArgumentSynthesis} from "./whole-book-argument-synthesis-schema";

export interface IndependentAuditInput {
  map: {
    chapterCount: number;
    excludedLowConfidencePages: number[];
    chapters: Array<{
      chapterId: string;
      title: string;
      importance: number;
      analysisStatus: string;
      sourceRefs: BookSourceRef[];
    }>;
  };
  chapters: Array<{
    chapterId: string;
    title: string;
    importance: number;
    summary: string;
    claims: Array<{
      claimId: string;
      statement: string;
      authorPosition: string;
      scope: {appliesTo: string[]; doesNotNecessarilyApplyTo: string[]};
      evidenceSupport?: string;
      sourceRefs: BookSourceRef[];
    }>;
    evidence: Array<{
      evidenceId: string;
      type: string;
      summary: string;
      supportsClaimIds: string[];
      strength: number;
      sourceRef?: BookSourceRef;
      originalExcerpt: string;
    }>;
    limitations: string[];
  }>;
  deepReads: InterrogativeDeepRead[];
  synthesis: WholeBookArgumentSynthesis;
}

export interface IndependentAuditProvider {
  readonly provider: string;
  readonly model: string;
  audit(input: IndependentAuditInput): Promise<IndependentAuditDraft>;
}
