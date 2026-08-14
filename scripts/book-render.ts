import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";
import {readFile, rename, unlink} from "node:fs/promises";
import {resolve} from "node:path";
import {verifyBookVideoOutput} from "../src/research/book/book-video-verification";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";

const parseJobId = (argv: string[]): string => {
  if (argv.length !== 1 || !argv[0] || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0])) {
    throw new Error("Usage: npm run book:render -- <job-id>");
  }
  return argv[0];
};

export const runBookRenderCli = async (argv = process.argv.slice(2)): Promise<void> => {
  const jobId = parseJobId(argv);
  const directory = resolve("output", jobId);
  const storyboard = parseVisualStoryboard(JSON.parse(await readFile(resolve(directory, "storyboard.json"), "utf8")));
  if (storyboard.profile !== "book-deep-reading" || !storyboard.audio.enabled) {
    throw new Error("book:render 需要完成配音与字幕的 book-deep-reading Storyboard");
  }
  const serveUrl = await bundle({entryPoint: resolve("apps/studio/src/index.ts"), publicDir: directory});
  const composition = await selectComposition({serveUrl, id: "BookDeepReading", inputProps: storyboard});
  const expectedFrames = Math.ceil((storyboard.format.durationMs / 1000) * storyboard.format.fps);
  if (composition.width !== 1080 || composition.height !== 1920 || composition.fps !== 30 || composition.durationInFrames !== expectedFrames) {
    throw new Error("BookDeepReading Composition 元数据与 Storyboard 不一致");
  }
  const temporaryPath = resolve(directory, "final.tmp.mp4");
  const videoPath = resolve(directory, "final.mp4");
  await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await renderMedia({
    codec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    composition,
    serveUrl,
    inputProps: storyboard,
    outputLocation: temporaryPath,
  });
  await rename(temporaryPath, videoPath);
  const verification = await verifyBookVideoOutput(jobId);
  console.log(JSON.stringify({
    jobId,
    videoDurationMs: verification.video.durationMs,
    voiceDurationMs: verification.voice.durationMs,
    scenes: verification.storyboard.scenes.length,
    subtitles: verification.storyboard.captions.length,
    longestStaticVisualMs: verification.longestStaticVisualMs,
    output: videoPath,
  }));
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-render.ts")) {
  await runBookRenderCli();
}
