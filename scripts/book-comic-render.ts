import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";
import {readFile, rename, unlink} from "node:fs/promises";
import {resolve} from "node:path";
import {loadAndAssertComicArtifactBindings, verifyBookComicVideoOutput} from "../src/research/book/book-comic-verification";
import {BookComicStoryboardSchema} from "../src/research/book/comic-storyboard-schema";

const parseJobId = (argv: string[]): string => {
  if (argv.length !== 1 || !argv[0] || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0])) throw new Error("Usage: npm run book:comic-render -- <job-id>");
  return argv[0];
};

export const runBookComicRenderCli = async (argv = process.argv.slice(2)): Promise<void> => {
  const jobId = parseJobId(argv);
  const directory = resolve("output", jobId);
  const storyboard = BookComicStoryboardSchema.parse(JSON.parse(await readFile(resolve(directory, "comic-storyboard.json"), "utf8")));
  await loadAndAssertComicArtifactBindings(directory, storyboard);
  const serveUrl = await bundle({entryPoint: resolve("apps/studio/src/index.ts"), publicDir: directory});
  const composition = await selectComposition({serveUrl, id: "BookComicExplainer", inputProps: storyboard});
  const expectedFrames = Math.ceil(storyboard.format.durationMs / 1000 * storyboard.format.fps);
  if (composition.width !== 1080 || composition.height !== 1920 || composition.fps !== 30 || composition.durationInFrames !== expectedFrames) throw new Error("BookComicExplainer 元数据与漫画分镜不一致");
  const temporaryPath = resolve(directory, "final-comic.tmp.mp4");
  const outputPath = resolve(directory, "final-comic.mp4");
  await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  await renderMedia({codec: "h264", audioCodec: "aac", pixelFormat: "yuv420p", composition, serveUrl, inputProps: storyboard, outputLocation: temporaryPath});
  await rename(temporaryPath, outputPath);
  const result = await verifyBookComicVideoOutput(jobId);
  console.log(JSON.stringify({jobId, videoDurationMs: result.video.durationMs, voiceDurationMs: result.voice.durationMs, scenes: result.pacing.sceneCount, subtitles: result.storyboard.captions.length, output: outputPath}));
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-comic-render.ts")) await runBookComicRenderCli();
