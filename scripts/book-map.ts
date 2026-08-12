import {resolve} from "node:path";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import type {BookMapProvider} from "../src/research/book/book-map-provider";
import {createOrReuseBookMap} from "../src/research/book/book-map-service";
import {readValidatedJson} from "../src/research/book/artifact-store";
import {createOpenAIBookMapProviderFromEnv} from "../src/research/book/openai-book-map-provider";
import {BookSourceSchema} from "../src/research/book/source-schema";

interface BookMapCliOptions {
  argv?: string[];
  provider?: BookMapProvider;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  createdAt?: string;
}

export const runBookMapCli = async ({
  argv = process.argv.slice(2),
  provider,
  stdout = console.log,
  stderr = console.error,
  createdAt,
}: BookMapCliOptions = {}): Promise<number> => {
  try {
    if (argv.length !== 1 || !argv[0]) {
      throw new Error("Usage: npm run book:map -- <job-id>");
    }
    const jobId = argv[0];
    const paths = getBookArtifactPaths(jobId);
    const source = await readValidatedJson(paths.source, BookSourceSchema);
    const selectedProvider = provider ?? createOpenAIBookMapProviderFromEnv();
    const result = await createOrReuseBookMap({
      source,
      outputPath: paths.map,
      provider: selectedProvider,
      createdAt,
    });

    stdout(JSON.stringify({
      jobId,
      outputPath: paths.map,
      provider: selectedProvider.provider,
      model: selectedProvider.model,
      chaptersAnalyzed: result.map.chapters.length,
      cacheHit: result.cacheHit,
    }, null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Book map failed: ${message}`);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-map.ts")) {
  process.exitCode = await runBookMapCli();
}
