import type {BookSourceRef} from "./common-schema";
import type {BookVideoAngleDraftSet} from "./book-video-angle-schema";

export interface BookVideoAngleInput {
  supportBundles: Array<{
    bundleId: string;
    statement: string;
    claimIds: string[];
    perspective: "author_view" | "system_synthesis" | "phase3c_critique";
  }>;
  synthesis: {
    coreTheses: Array<{statement: string; claimIds: string[]}>;
    tensions: Array<{statement: string; claimIds: string[]}>;
    limitations: Array<{statement: string; claimIds: string[]}>;
    practicalFrameworks: Array<{name: string; steps: string[]; claimIds: string[]}>;
    readerTakeaways: Array<{statement: string; claimIds: string[]}>;
  };
  claims: Array<{
    claimId: string;
    chapterId: string;
    statement: string;
    authorPosition: string;
    scope: {appliesTo: string[]; doesNotNecessarilyApplyTo: string[]};
    importance: number;
    evidence: Array<{
      evidenceId: string;
      type: string;
      summary: string;
      originalExcerpt: string;
      strength: number;
      sourceRef: BookSourceRef;
    }>;
    sourceRefs: BookSourceRef[];
  }>;
  deepReadCritiques: Array<{
    chapterId: string;
    evidenceLimits: unknown[];
    causalAssessment: unknown[];
    counterpoints: unknown[];
    contradictions: unknown[];
    scopeCorrections: unknown[];
    finalJudgment: string;
  }>;
}

export interface BookVideoAngleProvider {
  readonly provider: string;
  readonly model: string;
  generateAngles(input: BookVideoAngleInput, qualityIssues?: string[]): Promise<BookVideoAngleDraftSet>;
}
