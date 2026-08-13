import type {BookSourceRef} from "./common-schema";
import type {BookScriptDraft} from "./book-script-schema";
import type {BookSelectedAngle} from "./book-video-angle-schema";

export interface BookScriptInput {
  selectedAngle: BookSelectedAngle;
  claims: Array<{
    claimId: string;
    statement: string;
    authorPosition: string;
    scope: {appliesTo: string[]; doesNotNecessarilyApplyTo: string[]};
    evidence: Array<{
      evidenceId: string;
      type: string;
      summary: string;
      originalExcerpt: string;
      sourceRef: BookSourceRef;
    }>;
    sourceRefs: BookSourceRef[];
  }>;
  tensions: string[];
  limitations: string[];
  phase3CCritiques: Array<{
    chapterId: string;
    claimId: string;
    evidenceLimits: string[];
    causalAssessment: string[];
    scopeCorrections: string[];
    tensionsAndContradictions: string[];
    finalJudgment: string;
    sourceRefs: BookSourceRef[];
  }>;
}

export interface BookScriptProvider {
  readonly provider: string;
  readonly model: string;
  generateScript(input: BookScriptInput, qualityIssues?: string[]): Promise<BookScriptDraft>;
}
