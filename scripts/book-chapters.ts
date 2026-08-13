import {resolve} from "node:path";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import type {ChapterDeepReadProvider} from "../src/research/book/chapter-deep-read-provider";
import {createOrReuseTargetChapterAnalyses} from "../src/research/book/chapter-deep-read-service";
import {createOllamaChapterDeepReadProviderFromEnv} from "../src/research/book/ollama-chapter-deep-read-provider";
import {readValidatedJson} from "../src/research/book/artifact-store";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {BookSourceSchema} from "../src/research/book/source-schema";

interface Options {
  argv?: string[];
  provider?: ChapterDeepReadProvider;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  createdAt?: string;
}

export const runBookChaptersCli = async ({
  argv = process.argv.slice(2),
  provider,
  stdout = console.log,
  stderr = console.error,
  createdAt,
}: Options = {}): Promise<number> => {
  try {
    if (argv.length !== 1 || !argv[0]) {
      throw new Error("Usage: npm run book:chapters -- <job-id>");
    }
    const jobId = argv[0];
    const paths = getBookArtifactPaths(jobId);
    const [source, map] = await Promise.all([
      readValidatedJson(paths.source, BookSourceSchema),
      readValidatedJson(paths.map, BookMapSchema),
    ]);
    const selectedProvider = provider ?? createOllamaChapterDeepReadProviderFromEnv();
    const result = await createOrReuseTargetChapterAnalyses({
      source,
      map,
      chaptersDirectory: paths.chaptersDirectory,
      provider: selectedProvider,
      createdAt,
    });
    stdout(JSON.stringify({
      jobId,
      provider: selectedProvider.provider,
      model: selectedProvider.model,
      chaptersProcessed: result.analyses.length,
      chapterIds: result.analyses.map((analysis) => analysis.chapterId),
      cacheHits: result.cacheHits,
      claimsPerChapter: Object.fromEntries(
        result.analyses.map((analysis) => [analysis.chapterId, analysis.claims.length]),
      ),
      evidencePerChapter: Object.fromEntries(
        result.analyses.map((analysis) => [analysis.chapterId, analysis.evidence.length]),
      ),
      blockingTraceabilityIssues: result.blockingTraceabilityIssues,
    }, null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Book chapters failed: ${message}`);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-chapters.ts")) {
  process.exitCode = await runBookChaptersCli();
}
