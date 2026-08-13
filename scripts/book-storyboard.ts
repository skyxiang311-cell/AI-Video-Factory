import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {BookDeepScriptSchema} from "../src/research/book/book-script-schema";
import {buildBookVideoStoryboard} from "../src/research/book/book-video-storyboard";
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
  const script = BookDeepScriptSchema.parse(JSON.parse(await readFile(resolve(directory, "script.json"), "utf8")));
  if (script.quality.status !== "PASS" || script.quality.blockingIssues.length > 0) {
    throw new Error("只有通过质量门的 Book Deep Reading Script 才能生成 Storyboard");
  }
  const storyboard = buildBookVideoStoryboard(jobId, script);
  await atomicWriteJson(resolve(directory, "storyboard.json"), storyboard);
  console.log(JSON.stringify({jobId, profile: storyboard.profile, durationMs: storyboard.format.durationMs, scenes: storyboard.scenes.length}));
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-storyboard.ts")) {
  await runBookStoryboardCli();
}
