import {readdir, readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {BookDeepScriptSchema} from "../src/research/book/book-script-schema";
import {BookSelectedAngleSchema} from "../src/research/book/book-video-angle-schema";
import {calibrateBookVideoScript} from "../src/research/book/book-video-calibration";
import {buildBookVideoStoryboard} from "../src/research/book/book-video-storyboard";
import {InterrogativeDeepReadSchema} from "../src/research/book/interrogative-deep-read-schema";
import {ChapterAnalysisSchema} from "../src/research/book/knowledge-schema";
import {WholeBookArgumentSynthesisSchema} from "../src/research/book/whole-book-argument-synthesis-schema";
import {atomicWriteJson} from "../src/shared/atomic-write";

const parseJobId = (argv: string[]): string => {
  if (argv.length !== 1 || !argv[0] || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0])) {
    throw new Error("Usage: npm run book:storyboard -- <job-id>");
  }
  return argv[0];
};

export const runBookStoryboardCli = async (argv = process.argv.slice(2)): Promise<void> => {
  const jobId = parseJobId(argv);
  const directory = resolve("output", jobId);
  const bookDirectory = resolve(directory, "book");
  const script = BookDeepScriptSchema.parse(JSON.parse(await readFile(resolve(directory, "script.json"), "utf8")));
  if (script.quality.status !== "PASS" || script.quality.blockingIssues.length > 0) {
    throw new Error("只有通过质量门的 Book Deep Reading Script 才能生成 Storyboard");
  }
  const [selectedAngle, synthesis, chapterNames, deepReadNames, previousVoice] = await Promise.all([
    readFile(resolve(bookDirectory, "selected-angle.json"), "utf8").then((text) => BookSelectedAngleSchema.parse(JSON.parse(text))),
    readFile(resolve(bookDirectory, "book-synthesis.json"), "utf8").then((text) => WholeBookArgumentSynthesisSchema.parse(JSON.parse(text))),
    readdir(resolve(bookDirectory, "chapters")),
    readdir(resolve(bookDirectory, "deep-read")).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error)),
    readFile(resolve(directory, "voice.json"), "utf8").then((text) => JSON.parse(text) as {durationMs?: number}).catch((): {durationMs?: number} => ({})),
  ]);
  const chapters = await Promise.all(chapterNames.sort((left, right) => left.localeCompare(right, "en"))
    .filter((name) => /^chapter-[^.]+\.json$/u.test(name))
    .map((name) => readFile(resolve(bookDirectory, "chapters", name), "utf8").then((text) => ChapterAnalysisSchema.parse(JSON.parse(text)))));
  const deepReads = await Promise.all(deepReadNames.sort((left, right) => left.localeCompare(right, "en"))
    .filter((name) => /^chapter-[^.]+\.json$/u.test(name))
    .map((name) => readFile(resolve(bookDirectory, "deep-read", name), "utf8").then((text) => InterrogativeDeepReadSchema.parse(JSON.parse(text)))));
  if (!selectedAngle.eligible || selectedAngle.angleId !== script.selectedAngleId) {
    throw new Error("只能使用当前脚本对应且 eligible=true 的 selected-angle");
  }
  const invalidChapters = chapters.filter((chapter) =>
    chapter.quality.status !== "PASS" || (chapter.quality.blockingIssues?.length ?? 0) > 0);
  if (invalidChapters.length > 0) {
    throw new Error(`扩稿只允许使用 PASS ChapterAnalysis：${invalidChapters.map((chapter) => chapter.chapterId).join(", ")}`);
  }
  const fallbackDurationMs = Math.round(
    script.segments.map((segment) => segment.voiceText).join("").replace(/[^\p{L}\p{N}]/gu, "").length / 4.53 * 1000,
  );
  const calibration = calibrateBookVideoScript({
    script,
    sources: {selectedAngle, synthesis, chapters, deepReads},
    previousVoiceDurationMs: previousVoice.durationMs ?? fallbackDurationMs,
  });
  const storyboard = buildBookVideoStoryboard(jobId, calibration.script);
  await Promise.all([
    atomicWriteJson(resolve(directory, "video-script.json"), calibration.script),
    atomicWriteJson(resolve(directory, "video-calibration.json"), {
      schemaVersion: "1.0",
      jobId,
      expansionCount: calibration.expansionCount,
      ...calibration.statistics,
    }),
    atomicWriteJson(resolve(directory, "storyboard.json"), storyboard),
  ]);
  console.log(JSON.stringify({
    jobId,
    profile: storyboard.profile,
    plannedDurationMs: storyboard.format.durationMs,
    scenes: storyboard.scenes.length,
    expansionCount: calibration.expansionCount,
    voiceTextCharacters: calibration.statistics.totalCharacters,
    estimatedVoiceDurationSec: calibration.statistics.estimatedVoiceDurationSec,
  }));
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-storyboard.ts")) {
  await runBookStoryboardCli();
}
