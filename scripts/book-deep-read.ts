import {readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import {readValidatedJson} from "../src/research/book/artifact-store";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import type {InterrogativeDeepReadProvider} from "../src/research/book/interrogative-deep-read-provider";
import {createOrReuseInterrogativeDeepReads} from "../src/research/book/interrogative-deep-read-service";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {createOllamaInterrogativeDeepReadProviderFromEnv} from "../src/research/book/ollama-interrogative-deep-read-provider";
import {BookSourceSchema} from "../src/research/book/source-schema";

interface Options {
  argv?: string[];
  provider?: InterrogativeDeepReadProvider;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  createdAt?: string;
}

export const runBookDeepReadCli = async ({
  argv = process.argv.slice(2),
  provider,
  stdout = console.log,
  stderr = console.error,
  createdAt,
}: Options = {}): Promise<number> => {
  try {
    if (argv.length !== 1 || !argv[0]) {
      throw new Error("Usage: npm run book:deep-read -- <job-id>");
    }
    const jobId = argv[0];
    const paths = getBookArtifactPaths(jobId);
    const [source, map, chapterFiles] = await Promise.all([
      readValidatedJson(paths.source, BookSourceSchema),
      readValidatedJson(paths.map, BookMapSchema),
      readdir(paths.chaptersDirectory),
    ]);
    const targetIds = new Set(map.phase3BTargets.map((target) => target.chapterId));
    const analyses = await Promise.all(chapterFiles
      .filter((file) => /^chapter-[a-z0-9-]+\.json$/u.test(file))
      .map((file) => readValidatedJson(resolve(paths.chaptersDirectory, file), ChapterAnalysisSchema)))
      .then((items) => items.filter((analysis) => targetIds.has(analysis.chapterId)));
    const selectedProvider = provider ?? await createOllamaInterrogativeDeepReadProviderFromEnv();
    const result = await createOrReuseInterrogativeDeepReads({
      source,
      map,
      analyses,
      deepReadDirectory: paths.deepReadDirectory,
      provider: selectedProvider,
      createdAt,
    });
    stdout(JSON.stringify({
      jobId,
      provider: selectedProvider.provider,
      model: selectedProvider.model,
      selectedChapters: result.selectedChapters,
      cacheHits: result.cacheHits,
      revisedClaimsCount: result.revisedClaimsCount,
      causalIssuesFound: result.causalIssuesFound,
      scopeCorrectionsCount: result.scopeCorrectionsCount,
      contradictionsFound: result.contradictionsFound,
      blockingIssues: result.blockingIssues,
    }, null, 2));
    return result.blockingIssues.length === 0 ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Book deep-read failed: ${message}`);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-deep-read.ts")) {
  process.exitCode = await runBookDeepReadCli();
}
