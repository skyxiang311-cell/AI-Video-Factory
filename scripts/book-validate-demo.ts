import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {SelectedAngleSchema, VideoAnglesSchema} from "../src/research/book/angle-schema";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import {readValidatedJson, writeValidatedJson} from "../src/research/book/artifact-store";
import {BookAnalysisSchema} from "../src/research/book/book-analysis-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {evaluateDeepReadingQuality} from "../src/research/book/quality-gate";
import {BookSourceSchema} from "../src/research/book/source-schema";
import {BookSynthesisSchema} from "../src/research/book/synthesis-schema";
import {validateBookArtifactGraph} from "../src/research/book/traceability";
import {VerificationRecordSchema} from "../src/research/book/verification-schema";
import {getStoryboardProfile} from "../src/storyboard/profile";

const BOOK_DEMO_JOB_ID = "book-contract-demo";
const FIXTURE_DIRECTORY = resolve("templates", "book-deep-reading");

const readFixture = async (directory: string, name: string): Promise<unknown> => JSON.parse(
  await readFile(resolve(directory, name), "utf8"),
);

export const validateBookContractDemo = async ({
  fixtureDirectory = FIXTURE_DIRECTORY,
}: {fixtureDirectory?: string} = {}) => {
  const [
    sourceFixture,
    chapterFixture,
    synthesisFixture,
    verificationFixture,
    anglesFixture,
    selectedAngleFixture,
    analysisFixture,
  ] = await Promise.all([
    readFixture(fixtureDirectory, "sample-book-source.json"),
    readFixture(fixtureDirectory, "sample-chapter-analysis.json"),
    readFixture(fixtureDirectory, "sample-book-synthesis.json"),
    readFixture(fixtureDirectory, "sample-verification.json"),
    readFixture(fixtureDirectory, "sample-video-angles.json"),
    readFixture(fixtureDirectory, "sample-selected-angle.json"),
    readFixture(fixtureDirectory, "sample-book-analysis.json"),
  ]);

  const source = BookSourceSchema.parse(sourceFixture);
  const chapter = ChapterAnalysisSchema.parse(chapterFixture);
  const synthesis = BookSynthesisSchema.parse(synthesisFixture);
  const verification = VerificationRecordSchema.array().parse(verificationFixture);
  const videoAngles = VideoAnglesSchema.parse(anglesFixture);
  const selectedAngle = SelectedAngleSchema.parse(selectedAngleFixture);
  const analysis = BookAnalysisSchema.parse(analysisFixture);
  const traceabilityIssues = validateBookArtifactGraph({
    bookSource: source,
    chapterAnalyses: [chapter],
    synthesis,
    verificationRecords: verification,
    videoAngles,
    selectedAngle,
    analysis,
  });
  const qualityGate = evaluateDeepReadingQuality({
    score: analysis.qualityGate.score,
    blockingIssues: analysis.qualityGate.blockingIssues,
  });
  const storyboardProfile = getStoryboardProfile("book-deep-reading");

  if (traceabilityIssues.length > 0) {
    throw new Error(`Traceability validation failed: ${JSON.stringify(traceabilityIssues)}`);
  }
  if (analysis.qualityGate.status !== qualityGate.status
    || analysis.status !== qualityGate.status
    || qualityGate.status !== "approved_for_video") {
    throw new Error(`Deep-reading quality gate failed: ${analysis.qualityGate.status}`);
  }
  if (selectedAngle.targetDurationSec * 1_000 < storyboardProfile.targetMinDurationMs
    || selectedAngle.targetDurationSec * 1_000 > storyboardProfile.targetMaxDurationMs) {
    throw new Error(`Selected angle duration is outside the ${storyboardProfile.name} target range`);
  }

  const artifactPaths = getBookArtifactPaths(BOOK_DEMO_JOB_ID);
  const persistedAnalysis = BookAnalysisSchema.parse({
    ...analysis,
    artifacts: {
      source: artifactPaths.source,
      chapters: [artifactPaths.chapter(chapter.chapterId)],
      synthesis: artifactPaths.synthesis,
      verification: artifactPaths.verification,
      angles: artifactPaths.angles,
      selectedAngle: artifactPaths.selectedAngle,
    },
  });
  await writeValidatedJson(artifactPaths.source, BookSourceSchema, source);
  await writeValidatedJson(artifactPaths.chapter(chapter.chapterId), ChapterAnalysisSchema, chapter);
  await writeValidatedJson(artifactPaths.synthesis, BookSynthesisSchema, synthesis);
  await writeValidatedJson(artifactPaths.verification, VerificationRecordSchema.array(), verification);
  await writeValidatedJson(artifactPaths.angles, VideoAnglesSchema, videoAngles);
  await writeValidatedJson(artifactPaths.selectedAngle, SelectedAngleSchema, selectedAngle);
  await writeValidatedJson(artifactPaths.analysis, BookAnalysisSchema, persistedAnalysis);

  const indexedAnalysis = await readValidatedJson(artifactPaths.analysis, BookAnalysisSchema);
  await Promise.all([
    readValidatedJson(indexedAnalysis.artifacts.source, BookSourceSchema),
    ...indexedAnalysis.artifacts.chapters.map((chapterPath) =>
      readValidatedJson(chapterPath, ChapterAnalysisSchema)),
    readValidatedJson(indexedAnalysis.artifacts.synthesis, BookSynthesisSchema),
    readValidatedJson(indexedAnalysis.artifacts.verification, VerificationRecordSchema.array()),
    readValidatedJson(indexedAnalysis.artifacts.angles, VideoAnglesSchema),
    readValidatedJson(indexedAnalysis.artifacts.selectedAngle, SelectedAngleSchema),
  ]);

  return {
    deepReadingStatus: qualityGate.status,
    traceabilityIssues,
    selectedAngle,
    storyboardProfile,
  };
};

export const runBookContractDemoCli = async ({
  fixtureDirectory = FIXTURE_DIRECTORY,
  stdout = console.log,
  stderr = console.error,
}: {
  fixtureDirectory?: string;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
} = {}): Promise<number> => {
  try {
    const result = await validateBookContractDemo({fixtureDirectory});
    stdout(JSON.stringify({
      status: result.deepReadingStatus,
      traceabilityIssues: result.traceabilityIssues.length,
      targetDurationSec: result.selectedAngle.targetDurationSec,
      storyboardProfile: result.storyboardProfile.name,
      outputDirectory: getBookArtifactPaths(BOOK_DEMO_JOB_ID).directory,
    }, null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Book contract demo validation failed: ${message}`);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-validate-demo.ts")) {
  process.exitCode = await runBookContractDemoCli();
}
