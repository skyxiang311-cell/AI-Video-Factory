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
import {
  validateAngleRefs,
  validateBookSourceRefs,
  validateEvidenceRefs,
  validateSelectedAngleRefs,
} from "../src/research/book/traceability";
import {VerificationRecordSchema} from "../src/research/book/verification-schema";
import {getStoryboardProfile} from "../src/storyboard/profile";

const BOOK_DEMO_JOB_ID = "book-contract-demo";
const FIXTURE_DIRECTORY = resolve("templates", "book-deep-reading");

const readFixture = async (name: string): Promise<unknown> => JSON.parse(
  await readFile(resolve(FIXTURE_DIRECTORY, name), "utf8"),
);

export const validateBookContractDemo = async () => {
  const [
    sourceFixture,
    chapterFixture,
    synthesisFixture,
    verificationFixture,
    anglesFixture,
    selectedAngleFixture,
    analysisFixture,
  ] = await Promise.all([
    readFixture("sample-book-source.json"),
    readFixture("sample-chapter-analysis.json"),
    readFixture("sample-book-synthesis.json"),
    readFixture("sample-verification.json"),
    readFixture("sample-video-angles.json"),
    readFixture("sample-selected-angle.json"),
    readFixture("sample-book-analysis.json"),
  ]);

  const source = BookSourceSchema.parse(sourceFixture);
  const chapter = ChapterAnalysisSchema.parse(chapterFixture);
  const synthesis = BookSynthesisSchema.parse(synthesisFixture);
  const verification = VerificationRecordSchema.array().parse(verificationFixture);
  const videoAngles = VideoAnglesSchema.parse(anglesFixture);
  const selectedAngle = SelectedAngleSchema.parse(selectedAngleFixture);
  const analysis = BookAnalysisSchema.parse(analysisFixture);
  const claimIds = new Set(chapter.claims.map((claim) => claim.claimId));
  const evidenceIds = new Set(chapter.evidence.map((evidence) => evidence.evidenceId));
  const traceabilityIssues = [
    ...validateBookSourceRefs(source, [chapter]),
    ...validateEvidenceRefs([chapter]),
    ...validateAngleRefs(videoAngles, claimIds),
    ...validateSelectedAngleRefs(selectedAngle, claimIds, evidenceIds),
  ];
  const qualityGate = evaluateDeepReadingQuality({
    score: analysis.deepReadingScore,
    blockingIssues: traceabilityIssues.length > 0 ? ["CORE_CLAIM_MISSING_SOURCE"] : [],
  });
  const storyboardProfile = getStoryboardProfile("book-deep-reading");

  if (traceabilityIssues.length > 0) {
    throw new Error(`Traceability validation failed: ${JSON.stringify(traceabilityIssues)}`);
  }
  if (qualityGate.status !== "approved_for_video") {
    throw new Error(`Deep-reading quality gate failed: ${qualityGate.status}`);
  }
  if (selectedAngle.targetDurationSec * 1_000 < storyboardProfile.targetMinDurationMs
    || selectedAngle.targetDurationSec * 1_000 > storyboardProfile.targetMaxDurationMs) {
    throw new Error(`Selected angle duration is outside the ${storyboardProfile.name} target range`);
  }

  const artifactPaths = getBookArtifactPaths(BOOK_DEMO_JOB_ID);
  await writeValidatedJson(artifactPaths.source, BookSourceSchema, source);
  await writeValidatedJson(artifactPaths.chapter(chapter.chapterId), ChapterAnalysisSchema, chapter);
  await writeValidatedJson(artifactPaths.synthesis, BookSynthesisSchema, synthesis);
  await writeValidatedJson(artifactPaths.verification, VerificationRecordSchema.array(), verification);
  await writeValidatedJson(artifactPaths.angles, VideoAnglesSchema, videoAngles);
  await writeValidatedJson(artifactPaths.selectedAngle, SelectedAngleSchema, selectedAngle);
  await writeValidatedJson(artifactPaths.analysis, BookAnalysisSchema, analysis);

  await Promise.all([
    readValidatedJson(artifactPaths.source, BookSourceSchema),
    readValidatedJson(artifactPaths.chapter(chapter.chapterId), ChapterAnalysisSchema),
    readValidatedJson(artifactPaths.synthesis, BookSynthesisSchema),
    readValidatedJson(artifactPaths.verification, VerificationRecordSchema.array()),
    readValidatedJson(artifactPaths.angles, VideoAnglesSchema),
    readValidatedJson(artifactPaths.selectedAngle, SelectedAngleSchema),
    readValidatedJson(artifactPaths.analysis, BookAnalysisSchema),
  ]);

  return {
    deepReadingStatus: qualityGate.status,
    traceabilityIssues,
    selectedAngle,
    storyboardProfile,
  };
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-validate-demo.ts")) {
  try {
    const result = await validateBookContractDemo();
    console.log(JSON.stringify({
      status: result.deepReadingStatus,
      traceabilityIssues: result.traceabilityIssues.length,
      targetDurationSec: result.selectedAngle.targetDurationSec,
      storyboardProfile: result.storyboardProfile.name,
      outputDirectory: getBookArtifactPaths(BOOK_DEMO_JOB_ID).directory,
    }, null, 2));
  } catch (error) {
    console.error("Book contract demo validation failed:", error);
    process.exitCode = 1;
  }
}
