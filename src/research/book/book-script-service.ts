import {createHash} from "node:crypto";
import {z} from "zod";
import {readValidatedJson, writeValidatedJson} from "./artifact-store";
import {ArtifactMetaSchema, type BookSourceRef} from "./common-schema";
import type {BookScriptInput, BookScriptProvider} from "./book-script-provider";
import {BookDeepScriptSchema, BookScriptDraftSchema, type BookDeepScript, type BookScriptDraft} from "./book-script-schema";

export const BOOK_SCRIPT_PROMPT_VERSION = "book-five-minute-script-v2-phase3c-refs";
export const BOOK_SCRIPT_SCHEMA_VERSION = "1.0.0";

const CacheSchema = z.object({
  artifact: ArtifactMetaSchema,
  provider: z.object({name: z.string().min(1), model: z.string().min(1)}),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/),
});

interface Options {
  input: BookScriptInput;
  provider: BookScriptProvider;
  outputPath: string;
  cachePath: string;
  createdAt?: string;
}

export interface BookScriptResult {script: BookDeepScript; cacheHit: boolean}

const timeline = [
  ["primary_hook", 0, 3], ["hook_extension", 3, 8], ["audience_relevance", 8, 30],
  ["author_core_judgment", 30, 75], ["strongest_evidence", 75, 145],
  ["second_layer_mechanism", 145, 200], ["critical_turn", 200, 245],
  ["system_judgment", 245, 285], ["memorable_ending", 285, 300],
] as const;
const causalLanguage = /(导致|造成|决定|必然|因此产生|使得|引发|促使|推动|带来|致使|源于|归因于)/u;
const numericTokens = (value: string): string[] => value.normalize("NFKC").match(/\d+(?:\.\d+)?%?/gu) ?? [];
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const refKey = (ref: Pick<BookSourceRef, "chapterId" | "page" | "blockId">): string => `${ref.chapterId}:${ref.page}:${ref.blockId}`;

const evaluate = (raw: unknown, input: BookScriptInput): {script: BookDeepScript; issues: string[]} => {
  const draft = BookScriptDraftSchema.parse(raw);
  const issues: string[] = [];
  if (draft.title !== input.selectedAngle.title) issues.push("TITLE_OVERPROMISE Script title must equal selected-angle title");
  if (draft.selectedAngleId !== input.selectedAngle.angleId || draft.centralQuestion !== input.selectedAngle.centralQuestion) {
    issues.push("SCRIPT_OUTSIDE_SELECTED_ANGLE Script must keep the selected central question");
  }
  draft.segments.forEach((segment, index) => {
    const [purpose, startSec, endSec] = timeline[index]!;
    if (segment.purpose !== purpose || segment.startSec !== startSec || segment.endSec !== endSec) {
      issues.push(`TIMELINE_MISMATCH segment ${index + 1} must be ${purpose} ${startSec}-${endSec}`);
    }
  });
  const claims = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const selectedClaims = new Set(input.selectedAngle.coreClaimIds);
  const critiqueClaims = new Map(input.phase3CCritiques.map((critique) => [critique.claimId, critique]));
  for (const [index, segment] of draft.segments.entries()) {
    const knownSegmentClaims = segment.claimIds.map((claimId) => claims.get(claimId));
    const allowedClaimIds = index === 6
      ? new Set([...selectedClaims, ...critiqueClaims.keys()])
      : selectedClaims;
    if (segment.claimIds.some((claimId) => !allowedClaimIds.has(claimId)
      || (!claims.has(claimId) && !critiqueClaims.has(claimId)))) {
      issues.push(`DANGLING_OR_OUT_OF_ANGLE_CLAIM segment ${index + 1}`);
    }
    const allowedRefs = new Set([
      ...knownSegmentClaims.flatMap((claim) => claim?.sourceRefs ?? []),
      ...(index === 6 ? segment.claimIds.flatMap((claimId) => critiqueClaims.get(claimId)?.sourceRefs ?? []) : []),
    ].map(refKey));
    if (segment.sourceRefs.some((ref) => !allowedRefs.has(refKey(ref)))) {
      issues.push(`DANGLING_SOURCE_REF segment ${index + 1}`);
    }
    const supportText = knownSegmentClaims.flatMap((claim) => claim ? [
      claim.statement,
      ...claim.evidence.flatMap((item) => [item.summary, item.originalExcerpt]),
    ] : []).concat(index === 6 ? segment.claimIds.flatMap((claimId) => {
      const critique = critiqueClaims.get(claimId);
      return critique ? [
        ...critique.evidenceLimits,
        ...critique.causalAssessment,
        ...critique.scopeCorrections,
        ...critique.tensionsAndContradictions,
        critique.finalJudgment,
      ] : [];
    }) : []).join("\n");
    const supportNumbers = new Set(numericTokens(supportText));
    if (numericTokens(segment.voiceText).some((token) => !supportNumbers.has(token))) {
      issues.push(`UNSOURCED_NUMBER segment ${index + 1}`);
    }
    if (causalLanguage.test(segment.voiceText) && !causalLanguage.test(supportText)) {
      issues.push(`UNSUPPORTED_CAUSAL_LANGUAGE segment ${index + 1}`);
    }
  }
  if (!/(作者|书中)/u.test(draft.segments[3]!.voiceText)) issues.push("AUTHOR_VIEW_NOT_DISTINGUISHED segment 4");
  if (!/(我们|我的判断|这里的判断)/u.test(draft.segments[7]!.voiceText)) issues.push("SYSTEM_VIEW_NOT_DISTINGUISHED segment 8");
  const criticalSegment = draft.segments[6]!;
  const citedCritique = input.phase3CCritiques.some((critique) => (
    criticalSegment.claimIds.includes(critique.claimId)
    && criticalSegment.sourceRefs.some((ref) => critique.sourceRefs.some((sourceRef) => refKey(ref) === refKey(sourceRef)))
  ));
  if (!citedCritique) issues.push("PHASE3C_CRITIQUE_MISSING segment 7 must cite a real Phase3C claimId and sourceRef");
  if (draft.segments[4]!.claimIds.length === 0 || draft.segments[4]!.sourceRefs.length === 0) {
    issues.push("CORE_EVIDENCE_MISSING segment 5");
  }
  const overallScore = Object.values(draft.quality).reduce((sum, value) => sum + value, 0);
  if (overallScore < 80) issues.push(`QUALITY_SCORE_BELOW_80 actual=${overallScore}`);
  const uniqueIssues = [...new Set(issues)];
  return {
    script: BookDeepScriptSchema.parse({
      ...draft,
      durationSec: draft.segments.at(-1)!.endSec,
      quality: {
        ...draft.quality,
        overallScore,
        blockingIssues: uniqueIssues,
        status: uniqueIssues.length === 0 && overallScore >= 80 ? "PASS" : "BLOCKED",
      },
    }),
    issues: uniqueIssues,
  };
};

const readReusable = async (options: Options): Promise<BookDeepScript | null> => {
  try {
    const output = await readValidatedJson(options.outputPath, BookDeepScriptSchema);
    const cache = await readValidatedJson(options.cachePath, CacheSchema);
    if (cache.artifact.inputHash !== hash(options.input)
      || cache.artifact.promptVersion !== BOOK_SCRIPT_PROMPT_VERSION
      || cache.artifact.schemaVersion !== BOOK_SCRIPT_SCHEMA_VERSION
      || cache.artifact.modelProfile !== `${options.provider.provider}:${options.provider.model}`
      || cache.provider.name !== options.provider.provider
      || cache.provider.model !== options.provider.model
      || cache.outputHash !== hash(output)) return null;
    const reevaluated = evaluate(output, options.input).script;
    return reevaluated.quality.status === "PASS" ? output : null;
  } catch {
    return null;
  }
};

export const createOrReuseBookScript = async (options: Options): Promise<BookScriptResult> => {
  const reusable = await readReusable(options);
  if (reusable) return {script: reusable, cacheHit: true};
  let evaluated = evaluate(await options.provider.generateScript(options.input), options.input);
  if (evaluated.issues.length > 0) {
    evaluated = evaluate(await options.provider.generateScript(options.input, evaluated.issues), options.input);
  }
  if (evaluated.issues.length > 0 || evaluated.script.quality.status !== "PASS") {
    throw new Error(`SCRIPT_QUALITY_BLOCKED ${evaluated.issues.join("; ")}`);
  }
  await writeValidatedJson(options.outputPath, BookDeepScriptSchema, evaluated.script);
  await writeValidatedJson(options.cachePath, CacheSchema, {
    artifact: {
      inputHash: hash(options.input),
      promptVersion: BOOK_SCRIPT_PROMPT_VERSION,
      modelProfile: `${options.provider.provider}:${options.provider.model}`,
      schemaVersion: BOOK_SCRIPT_SCHEMA_VERSION,
      createdAt: options.createdAt ?? new Date().toISOString(),
    },
    provider: {name: options.provider.provider, model: options.provider.model},
    outputHash: hash(evaluated.script),
  });
  return {script: evaluated.script, cacheHit: false};
};

export const parseBookScriptDraft = (value: unknown): BookScriptDraft => BookScriptDraftSchema.parse(value);
