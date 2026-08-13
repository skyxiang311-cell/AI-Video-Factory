import {readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import {readValidatedJson} from "../src/research/book/artifact-store";
import {BookMapSchema} from "../src/research/book/book-map-schema";
import {InterrogativeDeepReadSchema} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {createOllamaWholeBookSynthesisProviderFromEnv} from "../src/research/book/ollama-whole-book-synthesis-provider";
import type {WholeBookSynthesisProvider} from "../src/research/book/whole-book-synthesis-provider";
import {createOrReuseWholeBookSynthesis} from "../src/research/book/whole-book-synthesis-service";

interface Options {
  argv?: string[];
  provider?: WholeBookSynthesisProvider;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  createdAt?: string;
}

const chapterArtifactName = /^chapter-[a-z0-9-]+\.json$/u;

export const runBookSynthesizeCli = async ({
  argv = process.argv.slice(2),
  provider,
  stdout = console.log,
  stderr = console.error,
  createdAt,
}: Options = {}): Promise<number> => {
  try {
    if (argv.length !== 1 || !argv[0]) {
      throw new Error("Usage: npm run book:synthesize -- <job-id>");
    }
    const jobId = argv[0];
    const paths = getBookArtifactPaths(jobId);
    const [map, chapterFiles, deepReadFiles] = await Promise.all([
      readValidatedJson(paths.map, BookMapSchema),
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
    const selectedProvider = provider ?? createOllamaWholeBookSynthesisProviderFromEnv();
    const result = await createOrReuseWholeBookSynthesis({
      map,
      analyses,
      deepReads,
      outputPath: paths.synthesis,
      cachePath: resolve(paths.directory, ".cache", "book-synthesis.json"),
      provider: selectedProvider,
      createdAt,
    });
    const supportingClaims = new Set(result.synthesis.coreThesis.flatMap((item) => (
      item.supportingClaimIds
    )));
    const relationTypes = [...new Set(result.synthesis.relations.map((item) => item.relation))];
    stdout(JSON.stringify({
      jobId,
      provider: selectedProvider.provider,
      model: selectedProvider.model,
      cacheHit: result.cacheHit,
      coreThesis: result.synthesis.coreThesis.map((item) => item.statement),
      supportingClaimsCount: supportingClaims.size,
      relationTypes,
      tensionsCount: result.synthesis.tensions.length,
      limitationsCount: result.synthesis.limitations.length,
      blockingIssues: result.blockingIssues,
    }, null, 2));
    return result.blockingIssues.length === 0 ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Book synthesis failed: ${message}`);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-synthesize.ts")) {
  process.exitCode = await runBookSynthesizeCli();
}
