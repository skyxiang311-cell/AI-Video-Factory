import {createHash} from "node:crypto";
import {z} from "zod";
import {readValidatedJson, writeValidatedJson} from "./artifact-store";
import {BookMapSchema, type BookMap} from "./book-map-schema";
import {ArtifactMetaSchema, type BookSourceRef} from "./common-schema";
import {InterrogativeDeepReadSchema, type InterrogativeDeepRead} from "./interrogative-deep-read-schema";
import {
  IndependentAuditSchema,
  IndependentAuditDraftSchema,
  type AuditFinding,
  type AuditRepair,
  type IndependentAudit,
  type IndependentAuditDraft,
} from "./independent-audit-schema";
import type {IndependentAuditInput, IndependentAuditProvider} from "./independent-audit-provider";
import {ChapterAnalysisSchema, type ChapterAnalysis} from "./knowledge-schema";
import {
  WholeBookArgumentSynthesisSchema,
  type WholeBookArgumentSynthesis,
} from "./whole-book-argument-synthesis-schema";

export const INDEPENDENT_AUDIT_PROMPT_VERSION = "independent-auditor-v1";
export const INDEPENDENT_AUDIT_SCHEMA_VERSION = "1.0.0";

const CacheSchema = z.object({
  artifact: ArtifactMetaSchema,
  provider: z.object({name: z.string().min(1), model: z.string().min(1)}),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/),
});

interface CreateOptions {
  map: BookMap;
  analyses: ChapterAnalysis[];
  deepReads: InterrogativeDeepRead[];
  synthesis: WholeBookArgumentSynthesis;
  outputPath: string;
  cachePath: string;
  provider: IndependentAuditProvider;
  createdAt?: string;
}

export interface IndependentAuditResult {
  audit: IndependentAudit;
  cacheHit: boolean;
}

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bookRefs = (refs: readonly {type: string}[]): BookSourceRef[] => refs.filter(
  (ref): ref is BookSourceRef => ref.type === "book",
);

const buildInput = (
  map: BookMap,
  analyses: readonly ChapterAnalysis[],
  deepReads: readonly InterrogativeDeepRead[],
  synthesis: WholeBookArgumentSynthesis,
): IndependentAuditInput => ({
  map: {
    chapterCount: map.chapters.length,
    excludedLowConfidencePages: map.excludedLowConfidencePages.map((item) => item.page),
    chapters: map.chapters.map((chapter) => ({
      chapterId: chapter.chapterId,
      title: chapter.title,
      importance: chapter.importance,
      analysisStatus: chapter.analysisStatus,
      sourceRefs: chapter.sourceRefs,
    })),
  },
  chapters: analyses.filter((analysis) => (
    analysis.quality.status === "PASS" && (analysis.quality.blockingIssues?.length ?? 0) === 0
  )).map((analysis) => ({
    chapterId: analysis.chapterId,
    title: analysis.title,
    importance: analysis.importance.score,
    summary: analysis.summary.oneSentence,
    claims: analysis.claims.map((claim) => ({
      claimId: claim.claimId,
      statement: claim.statement,
      authorPosition: claim.authorPosition,
      scope: claim.scope,
      evidenceSupport: claim.evidenceSupport,
      sourceRefs: [...claim.bookEvidenceRefs, ...bookRefs(claim.sourceRefs)],
    })),
    evidence: analysis.evidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      type: evidence.type,
      summary: evidence.summary,
      supportsClaimIds: evidence.supportsClaimIds,
      strength: evidence.strength,
      sourceRef: evidence.sourceRef.type === "book" ? evidence.sourceRef : undefined,
      originalExcerpt: evidence.originalExcerpt,
    })),
    limitations: analysis.limitations,
  })),
  deepReads: [...deepReads],
  synthesis,
});

const synthesisClaimIds = (synthesis: WholeBookArgumentSynthesis): string[] => [
  ...synthesis.coreThesis.flatMap((item) => item.supportingClaimIds),
  ...synthesis.secondaryTheses.flatMap((item) => item.supportingClaimIds),
  ...synthesis.argumentMap.flatMap((item) => item.supportingClaimIds),
  ...synthesis.keyConcepts.flatMap((item) => item.supportingClaimIds),
  ...synthesis.crossChapterPatterns.flatMap((item) => item.supportingClaimIds),
  ...synthesis.tensions.flatMap((item) => item.supportingClaimIds),
  ...synthesis.limitations.flatMap((item) => item.supportingClaimIds),
  ...synthesis.practicalFrameworks.flatMap((item) => item.supportingClaimIds),
  ...synthesis.readerTakeaways.flatMap((item) => item.supportingClaimIds),
  ...synthesis.relations.flatMap((item) => [item.fromClaimId, item.toClaimId]),
];

const findingKey = (finding: AuditFinding): string => `${finding.code}:${finding.artifact}:${finding.claimIds.join(",")}`;
const repairKey = (repair: AuditRepair): string => `${repair.code}:${repair.artifact}:${repair.claimIds.join(",")}`;

const concreteArtifact = (
  artifact: string,
  claimIds: readonly string[],
  claimChapters: ReadonlyMap<string, string>,
): string => {
  if (artifact.includes(".json") || artifact.endsWith("/")) return artifact;
  const chapters = [...new Set(claimIds.map((claimId) => claimChapters.get(claimId)).filter(
    (chapterId): chapterId is string => Boolean(chapterId),
  ))];
  return chapters.length === 1 ? `chapters/${chapters[0]}.json` : artifact;
};

const deterministicFindings = (input: IndependentAuditInput, draft: IndependentAuditDraft): {
  blockingIssues: AuditFinding[];
  warnings: AuditFinding[];
  requiredRepairs: AuditRepair[];
} => {
  const knownClaims = new Set(input.chapters.flatMap((chapter) => chapter.claims.map((claim) => claim.claimId)));
  const claimChapters = new Map(input.chapters.flatMap((chapter) => chapter.claims.map((claim) => (
    [claim.claimId, chapter.chapterId] as const
  ))));
  const normalizedDraft = {
    ...draft,
    blockingIssues: draft.blockingIssues.map((issue) => ({
      ...issue,
      artifact: concreteArtifact(issue.artifact, issue.claimIds, claimChapters),
    })),
    warnings: draft.warnings.map((issue) => ({
      ...issue,
      artifact: concreteArtifact(issue.artifact, issue.claimIds, claimChapters),
    })),
    requiredRepairs: draft.requiredRepairs.map((repair) => ({
      ...repair,
      artifact: concreteArtifact(repair.artifact, repair.claimIds, claimChapters),
    })),
  };
  const allAuditClaimIds = [
    ...normalizedDraft.blockingIssues,
    ...normalizedDraft.warnings,
    ...draft.strengths,
  ].flatMap((finding) => finding.claimIds);
  const repairClaimIds = normalizedDraft.requiredRepairs.flatMap((repair) => repair.claimIds);
  const dangling = [...new Set([
    ...synthesisClaimIds(input.synthesis),
    ...input.chapters.flatMap((chapter) => chapter.evidence.flatMap((evidence) => evidence.supportsClaimIds)),
    ...allAuditClaimIds,
    ...repairClaimIds,
  ].filter((claimId) => !knownClaims.has(claimId)))];
  const blockingIssues: AuditFinding[] = [...normalizedDraft.blockingIssues];
  const requiredRepairs: AuditRepair[] = [...normalizedDraft.requiredRepairs];
  if (dangling.length > 0) {
    blockingIssues.push({
      code: "DANGLING_CLAIM_REF",
      artifact: "book-synthesis.json / audit.json",
      claimIds: dangling,
      message: `发现不存在的 Claim 引用：${dangling.join(", ")}`,
    });
    requiredRepairs.push({
      code: "DANGLING_CLAIM_REF",
      artifact: "book-synthesis.json / audit.json",
      claimIds: dangling,
      action: "删除或改为 chapters/*.json 中真实存在的 Claim ID。",
    });
  }

  const excludedPages = new Set(input.map.excludedLowConfidencePages);
  const claims = new Map(input.chapters.flatMap((chapter) => chapter.claims.map((claim) => [claim.claimId, claim] as const)));
  input.synthesis.coreThesis.forEach((thesis) => {
    const refs = thesis.supportingClaimIds.flatMap((claimId) => claims.get(claimId)?.sourceRefs ?? []);
    if (refs.length > 0 && refs.every((ref) => excludedPages.has(ref.page))) {
      blockingIssues.push({
        code: "LOW_CONFIDENCE_SOLE_CORE_SUPPORT",
        artifact: "book-synthesis.json",
        claimIds: thesis.supportingClaimIds,
        message: "核心命题唯一依据全部来自低置信度 OCR 页面。",
      });
      requiredRepairs.push({
        code: "LOW_CONFIDENCE_SOLE_CORE_SUPPORT",
        artifact: "book-synthesis.json",
        claimIds: thesis.supportingClaimIds,
        action: "移除该核心命题，或补充非低置信度页面中的直接 Claim 支持。",
      });
    }
  });

  const warnings = [...normalizedDraft.warnings];
  if (input.chapters.length < input.map.chapterCount) {
    warnings.push({
      code: "PARTIAL_DEEP_READING_COVERAGE",
      artifact: "chapters/",
      claimIds: [],
      message: `${input.map.chapterCount} 章中 ${input.chapters.length} 章有 PASS Claim-first 分析。`,
    });
  }
  return {
    blockingIssues: [...new Map(blockingIssues.map((item) => [findingKey(item), item])).values()],
    warnings: [...new Map(warnings.map((item) => [findingKey(item), item])).values()],
    requiredRepairs: [...new Map(requiredRepairs.map((item) => [repairKey(item), item])).values()],
  };
};

const finalize = (raw: unknown, input: IndependentAuditInput): IndependentAudit => {
  const draft = IndependentAuditDraftSchema.parse(raw);
  const findings = deterministicFindings(input, draft);
  const scores = [draft.coverageScore, draft.thesisScore, draft.evidenceScore, draft.scopeScore,
    draft.causalityScore, draft.synthesisScore, draft.traceabilityScore];
  const overallScore = Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
  const status = findings.blockingIssues.length > 0 || overallScore < 75
    ? "BLOCKED" as const
    : overallScore < 85 ? "NEEDS_REVIEW" as const : "PASS" as const;
  return IndependentAuditSchema.parse({
    ...draft,
    ...findings,
    overallScore,
    status,
    videoReady: status === "PASS",
  });
};

const readReusable = async (
  input: IndependentAuditInput,
  outputPath: string,
  cachePath: string,
  provider: IndependentAuditProvider,
): Promise<IndependentAudit | null> => {
  try {
    const output = await readValidatedJson(outputPath, IndependentAuditSchema);
    const cache = await readValidatedJson(cachePath, CacheSchema);
    if (cache.artifact.inputHash !== hash(input)
      || cache.artifact.promptVersion !== INDEPENDENT_AUDIT_PROMPT_VERSION
      || cache.artifact.schemaVersion !== INDEPENDENT_AUDIT_SCHEMA_VERSION
      || cache.artifact.modelProfile !== `${provider.provider}:${provider.model}`
      || cache.provider.name !== provider.provider
      || cache.provider.model !== provider.model
      || cache.outputHash !== hash(output)) return null;
    const finalized = finalize(output, input);
    if (hash(finalized) !== hash(output)) {
      await writeValidatedJson(outputPath, IndependentAuditSchema, finalized);
      await writeValidatedJson(cachePath, CacheSchema, {...cache, outputHash: hash(finalized)});
    }
    return finalized;
  } catch {
    return null;
  }
};

export const createOrReuseIndependentAudit = async ({
  map: rawMap,
  analyses: rawAnalyses,
  deepReads: rawDeepReads,
  synthesis: rawSynthesis,
  outputPath,
  cachePath,
  provider,
  createdAt,
}: CreateOptions): Promise<IndependentAuditResult> => {
  const map = BookMapSchema.parse(rawMap);
  const analyses = rawAnalyses.map((analysis) => ChapterAnalysisSchema.parse(analysis));
  const deepReads = rawDeepReads.map((deepRead) => InterrogativeDeepReadSchema.parse(deepRead));
  const synthesis = WholeBookArgumentSynthesisSchema.parse(rawSynthesis);
  const input = buildInput(map, analyses, deepReads, synthesis);
  const reusable = await readReusable(input, outputPath, cachePath, provider);
  if (reusable) return {audit: reusable, cacheHit: true};
  const audit = finalize(await provider.audit(input), input);
  await writeValidatedJson(outputPath, IndependentAuditSchema, audit);
  await writeValidatedJson(cachePath, CacheSchema, {
    artifact: {
      inputHash: hash(input),
      promptVersion: INDEPENDENT_AUDIT_PROMPT_VERSION,
      modelProfile: `${provider.provider}:${provider.model}`,
      schemaVersion: INDEPENDENT_AUDIT_SCHEMA_VERSION,
      createdAt: createdAt ?? new Date().toISOString(),
    },
    provider: {name: provider.provider, model: provider.model},
    outputHash: hash(audit),
  });
  return {audit, cacheHit: false};
};
