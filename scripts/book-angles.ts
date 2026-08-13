import {readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import {readValidatedJson} from "../src/research/book/artifact-store";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {createOrReuseBookVideoAngles} from "../src/research/book/book-video-angle-service";
import type {BookVideoAngleProvider} from "../src/research/book/book-video-angle-provider";
import {IndependentAuditSchema} from "../src/research/book/independent-audit-schema";
import {InterrogativeDeepReadSchema} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {createOllamaBookVideoAngleProviderFromEnv} from "../src/research/book/ollama-book-video-angle-provider";
import {WholeBookArgumentSynthesisSchema} from "../src/research/book/whole-book-argument-synthesis-schema";

interface Options {argv?: string[]; provider?: BookVideoAngleProvider; stdout?: (message: string) => void; stderr?: (message: string) => void; createdAt?: string}
const chapterFile = /^chapter-[a-z0-9-]+\.json$/u;

export const runBookAnglesCli = async ({
  argv = process.argv.slice(2), provider, stdout = console.log, stderr = console.error, createdAt,
}: Options = {}): Promise<number> => {
  try {
    if (argv.length !== 1 || !argv[0]) throw new Error("Usage: npm run book:angles -- <job-id>");
    const jobId = argv[0];
    const paths = getBookArtifactPaths(jobId);
    const [map, synthesis, audit, chapterFiles, deepReadFiles] = await Promise.all([
      readValidatedJson(paths.map, BookMapSchema),
      readValidatedJson(paths.synthesis, WholeBookArgumentSynthesisSchema),
      readValidatedJson(paths.audit, IndependentAuditSchema),
      readdir(paths.chaptersDirectory),
      readdir(paths.deepReadDirectory),
    ]);
    const [analyses, deepReads] = await Promise.all([
      Promise.all(chapterFiles.filter((file) => chapterFile.test(file)).map((file) => readValidatedJson(resolve(paths.chaptersDirectory, file), ChapterAnalysisSchema))),
      Promise.all(deepReadFiles.filter((file) => chapterFile.test(file)).map((file) => readValidatedJson(resolve(paths.deepReadDirectory, file), InterrogativeDeepReadSchema))),
    ]);
    const selectedProvider = provider ?? createOllamaBookVideoAngleProviderFromEnv();
    const result = await createOrReuseBookVideoAngles({
      map, synthesis, audit, analyses, deepReads, provider: selectedProvider,
      outputPath: paths.angles, selectedPath: paths.selectedAngle,
      cachePath: resolve(paths.directory, ".cache", "video-angles.json"), createdAt,
    });
    stdout(JSON.stringify({
      jobId, provider: selectedProvider.provider, model: selectedProvider.model, cacheHit: result.cacheHit,
      candidateCount: result.angles.candidates.length,
      topAngles: result.angles.candidates.slice(0, 3).map((item) => ({title: item.title, overallScore: item.overallScore})),
      selectedAngle: result.selected.title, selectedScore: result.selected.overallScore,
    }, null, 2));
    return 0;
  } catch (error) {
    stderr(`Book angles failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-angles.ts")) process.exitCode = await runBookAnglesCli();
