import {readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import {readValidatedJson} from "../src/research/book/artifact-store";
import type {BookScriptInput, BookScriptProvider} from "../src/research/book/book-script-provider";
import {createOrReuseBookScript} from "../src/research/book/book-script-service";
import {BookSelectedAngleSchema} from "../src/research/book/book-video-angle-schema";
import {IndependentAuditSchema} from "../src/research/book/independent-audit-schema";
import {InterrogativeDeepReadSchema} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {createOllamaBookScriptProviderFromEnv} from "../src/research/book/ollama-book-script-provider";
import {WholeBookArgumentSynthesisSchema} from "../src/research/book/whole-book-argument-synthesis-schema";
import type {BookSourceRef} from "../src/research/book/common-schema";

interface Options {argv?: string[]; provider?: BookScriptProvider; stdout?: (message: string) => void; stderr?: (message: string) => void; createdAt?: string}
const chapterFile = /^chapter-[a-z0-9-]+\.json$/u;
const refKey = (ref: BookSourceRef): string => `${ref.chapterId}:${ref.page}:${ref.blockId}`;
const uniqueRefs = (refs: BookSourceRef[]): BookSourceRef[] => [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];
const normalize = (value: string): string => value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const features = (value: string): Set<string> => {
  const text = normalize(value);
  const result = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) result.add(text.slice(index, index + 2));
  return result;
};
const relevance = (target: string, candidate: string): number => {
  const wanted = features(target);
  if (wanted.size === 0) return 0;
  const available = features(candidate);
  return [...wanted].filter((feature) => available.has(feature)).length / wanted.size;
};

export const runBookScriptCli = async ({
  argv = process.argv.slice(2), provider, stdout = console.log, stderr = console.error, createdAt,
}: Options = {}): Promise<number> => {
  try {
    if (argv.length !== 1 || !argv[0]) throw new Error("Usage: npm run book:script -- <job-id>");
    const jobId = argv[0];
    const paths = getBookArtifactPaths(jobId);
    const [selectedAngle, synthesis, audit, chapterFiles, deepReadFiles] = await Promise.all([
      readValidatedJson(paths.selectedAngle, BookSelectedAngleSchema),
      readValidatedJson(paths.synthesis, WholeBookArgumentSynthesisSchema),
      readValidatedJson(paths.audit, IndependentAuditSchema),
      readdir(paths.chaptersDirectory),
      readdir(paths.deepReadDirectory),
    ]);
    if (!audit.videoReady || audit.blockingIssues.length > 0) throw new Error("AUDIT_NOT_VIDEO_READY");
    const [analyses, deepReads] = await Promise.all([
      Promise.all(chapterFiles.filter((file) => chapterFile.test(file)).map((file) => readValidatedJson(resolve(paths.chaptersDirectory, file), ChapterAnalysisSchema))),
      Promise.all(deepReadFiles.filter((file) => chapterFile.test(file)).map((file) => readValidatedJson(resolve(paths.deepReadDirectory, file), InterrogativeDeepReadSchema))),
    ]);
    const selectedIds = new Set(selectedAngle.coreClaimIds);
    const claims: BookScriptInput["claims"] = analyses.flatMap((analysis) => analysis.claims.filter((claim) => selectedIds.has(claim.claimId)).map((claim) => {
      const evidence = analysis.evidence.filter((item) => item.supportsClaimIds.includes(claim.claimId) && item.sourceRef.type === "book").map((item) => ({
        evidenceId: item.evidenceId, type: item.type, summary: item.summary, originalExcerpt: item.originalExcerpt, sourceRef: item.sourceRef as BookSourceRef,
      }));
      return {
        claimId: claim.claimId, statement: claim.statement, authorPosition: claim.authorPosition, scope: claim.scope, evidence,
        sourceRefs: uniqueRefs([...claim.bookEvidenceRefs, ...claim.sourceRefs.filter((ref): ref is BookSourceRef => ref.type === "book"), ...evidence.map((item) => item.sourceRef)]),
      };
    }));
    if (claims.length !== selectedIds.size) throw new Error("SELECTED_ANGLE_CLAIM_MISSING");
    const input: BookScriptInput = {
      selectedAngle,
      claims,
      tensions: synthesis.tensions.map((item) => item.statement),
      limitations: synthesis.limitations.map((item) => item.statement),
      phase3CCritiques: deepReads.map((item) => ({
        chapterId: item.chapterId,
        claimId: item.originalClaims[0]!.claimId,
        evidenceLimits: item.evidenceLimits.flatMap((value) => [value.proves, value.doesNotProve]),
        causalAssessment: item.causalAssessment.map((value) => value.assessment),
        scopeCorrections: item.scopeCorrections.map((value) => value.correction),
        tensionsAndContradictions: [
          ...item.counterpoints.map((value) => value.statement),
          ...item.contradictions.map((value) => value.statement),
        ],
        finalJudgment: item.finalJudgment,
        sourceRefs: uniqueRefs(item.sourceRefs),
      })).sort((left, right) => {
        const target = [selectedAngle.title, selectedAngle.centralQuestion, selectedAngle.thesis, ...selectedAngle.risks].join("\n");
        const text = (item: typeof left): string => JSON.stringify(item);
        return relevance(target, text(right)) - relevance(target, text(left));
      }).slice(0, 1),
    };
    const selectedProvider = provider ?? createOllamaBookScriptProviderFromEnv();
    const result = await createOrReuseBookScript({
      input, provider: selectedProvider, outputPath: paths.script,
      cachePath: resolve(paths.directory, ".cache", "script.json"), createdAt,
    });
    stdout(JSON.stringify({
      jobId, provider: selectedProvider.provider, model: selectedProvider.model, cacheHit: result.cacheHit,
      selectedAngle: selectedAngle.title, durationSec: result.script.durationSec,
      qualityScore: result.script.quality.overallScore, blockingIssues: result.script.quality.blockingIssues,
      status: result.script.quality.status, outputPath: paths.script,
    }, null, 2));
    return result.script.quality.status === "PASS" ? 0 : 1;
  } catch (error) {
    stderr(`Book script failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-script.ts")) process.exitCode = await runBookScriptCli();
