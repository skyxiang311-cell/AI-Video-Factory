import {basename, extname, resolve} from "node:path";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import {writeValidatedJson} from "../src/research/book/artifact-store";
import {ingestDigitalPdf} from "../src/research/book/pdf-ingest";
import {BookSourceSchema} from "../src/research/book/source-schema";

interface BookIngestCliOptions {
  argv?: string[];
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
}

export const deriveBookIngestJobId = (pdfPath: string): string => {
  const stem = basename(pdfPath, extname(pdfPath)).toLowerCase();
  const jobId = stem
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (!jobId) throw new Error("PDF filename must contain a safe job id");
  return jobId;
};

export const runBookIngestCli = async ({
  argv = process.argv.slice(2),
  stdout = console.log,
  stderr = console.error,
}: BookIngestCliOptions = {}): Promise<number> => {
  try {
    if (argv.length !== 1 || !argv[0]) {
      throw new Error("Usage: npm run book:ingest -- <pdf-path>");
    }
    const pdfPath = argv[0];
    if (extname(pdfPath).toLowerCase() !== ".pdf") {
      throw new Error("Input must be a .pdf file");
    }

    const jobId = deriveBookIngestJobId(pdfPath);
    const source = await ingestDigitalPdf(pdfPath);
    const outputPath = getBookArtifactPaths(jobId).source;
    await writeValidatedJson(outputPath, BookSourceSchema, source);
    const blockCount = source.pages.reduce(
      (count, page) => count + page.contentBlocks.length,
      0,
    );

    stdout(JSON.stringify({
      jobId,
      outputPath,
      pageCount: source.metadata.pageCount,
      blockCount,
    }, null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Book ingest failed: ${message}`);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-ingest.ts")) {
  process.exitCode = await runBookIngestCli();
}
