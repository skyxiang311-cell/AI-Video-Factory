import {readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import {readValidatedJson} from "../src/research/book/artifact-store";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {createOrReuseIndependentAudit} from "../src/research/book/independent-audit-service";
import type {IndependentAuditProvider} from "../src/research/book/independent-audit-provider";
import {InterrogativeDeepReadSchema} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {createOllamaIndependentAuditProviderFromEnv} from "../src/research/book/ollama-independent-audit-provider";
import {WholeBookArgumentSynthesisSchema} from "../src/research/book/whole-book-argument-synthesis-schema";

interface Options {
  argv?: string[];
  provider?: IndependentAuditProvider;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  createdAt?: string;
}

const chapterArtifactName = /^chapter-[a-z0-9-]+\.json$/u;

export const runBookAuditCli = async ({
  argv = process.argv.slice(2),
  provider,
  stdout = console.log,
  stderr = console.error,
  createdAt,
}: Options = {}): Promise<number> => {
  try {
    if (argv.length !== 1 || !argv[0]) throw new Error("Usage: npm run book:audit -- <job-id>");
    const jobId = argv[0];
    const paths = getBookArtifactPaths(jobId);
    const [map, synthesis, chapterFiles, deepReadFiles] = await Promise.all([
      readValidatedJson(paths.map, BookMapSchema),
      readValidatedJson(paths.synthesis, WholeBookArgumentSynthesisSchema),
      readdir(paths.chaptersDirectory),
      readdir(paths.deepReadDirectory),
    ]);
    const [analyses, deepReads] = await Promise.all([
      Promise.all(chapterFiles.filter((file) => chapterArtifactName.test(file)).map((file) => (
        readValidatedJson(resolve(paths.chaptersDirectory, file), ChapterAnalysisSchema)
      ))),
      Promise.all(deepReadFiles.filter((file) => chapterArtifactName.test(file)).map((file) => (
        readValidatedJson(resolve(paths.deepReadDirectory, file), InterrogativeDeepReadSchema)
      ))),
    ]);
    const selectedProvider = provider ?? createOllamaIndependentAuditProviderFromEnv();
    const result = await createOrReuseIndependentAudit({
      map,
      analyses,
      deepReads,
      synthesis,
      outputPath: paths.audit,
      cachePath: resolve(paths.directory, ".cache", "audit.json"),
      provider: selectedProvider,
      createdAt,
    });
    stdout(JSON.stringify({
      jobId,
      provider: selectedProvider.provider,
      model: selectedProvider.model,
      cacheHit: result.cacheHit,
      overallScore: result.audit.overallScore,
      blockingIssuesCount: result.audit.blockingIssues.length,
      warningsCount: result.audit.warnings.length,
      videoReady: result.audit.videoReady,
      requiredRepairs: result.audit.requiredRepairs,
      status: result.audit.status,
      outputPath: paths.audit,
    }, null, 2));
    return 0;
  } catch (error) {
    stderr(`Book audit failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-audit.ts")) {
  process.exitCode = await runBookAuditCli();
}
