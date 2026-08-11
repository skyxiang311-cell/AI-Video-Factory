import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";
import ffmpegPath from "ffmpeg-static";
import {mkdir, rename, stat, unlink} from "node:fs/promises";
import {resolve} from "node:path";
import {spawn} from "node:child_process";
import {atomicWriteJson} from "../src/shared/atomic-write";
import {createDemoArtifacts} from "../src/shared/demo-artifacts";
import {
  DEMO_DURATION_IN_FRAMES,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "../src/shared/video-constants";
import {parseStoryboard} from "../src/storyboard/schema";
import sampleStoryboardJson from "../templates/knowledge/sample-storyboard.json";

const runProcess = async (executable: string, args: string[]): Promise<void> =>
  new Promise((resolveProcess, reject) => {
    const child = spawn(executable, args, {stdio: "inherit"});
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveProcess();
        return;
      }
      reject(
        new Error(
          `命令执行失败：退出码 ${String(code)}，信号 ${String(signal)}`,
        ),
      );
    });
  });

const removeExactFileIfPresent = async (filePath: string): Promise<void> => {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
};

const assertCompositionMetadata = (composition: {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}): void => {
  const actual = [
    composition.width,
    composition.height,
    composition.fps,
    composition.durationInFrames,
  ];
  const expected = [
    VIDEO_WIDTH,
    VIDEO_HEIGHT,
    VIDEO_FPS,
    DEMO_DURATION_IN_FRAMES,
  ];

  if (actual.some((value, index) => value !== expected[index])) {
    throw new Error(
      `Composition 元数据不符合预期：${composition.width}×${composition.height}，${composition.fps}fps，${composition.durationInFrames} 帧`,
    );
  }
};

const main = async (): Promise<void> => {
  const startedAt = Date.now();
  const storyboard = parseStoryboard(sampleStoryboardJson);
  const outputDirectory = resolve("output", storyboard.jobId);
  const voiceTemporaryPath = resolve(outputDirectory, "voice.tmp.mp3");
  const voicePath = resolve(outputDirectory, "voice.mp3");
  const videoTemporaryPath = resolve(outputDirectory, "final.tmp.mp4");
  const videoPath = resolve(outputDirectory, "final.mp4");
  const artifacts = createDemoArtifacts(storyboard);

  await mkdir(outputDirectory, {recursive: true});
  await Promise.all([
    atomicWriteJson(resolve(outputDirectory, "source.json"), artifacts.source),
    atomicWriteJson(resolve(outputDirectory, "analysis.json"), artifacts.analysis),
    atomicWriteJson(resolve(outputDirectory, "script.json"), artifacts.script),
    atomicWriteJson(resolve(outputDirectory, "storyboard.json"), storyboard),
    atomicWriteJson(
      resolve(outputDirectory, "subtitles.json"),
      artifacts.subtitles,
    ),
    atomicWriteJson(resolve(outputDirectory, "assets.json"), artifacts.assets),
  ]);

  if (!ffmpegPath) {
    throw new Error("ffmpeg-static 未提供可执行文件路径");
  }

  await removeExactFileIfPresent(voiceTemporaryPath);
  await runProcess(ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(storyboard.format.durationMs / 1000),
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "9",
    voiceTemporaryPath,
  ]);
  await rename(voiceTemporaryPath, voicePath);

  const serveUrl = await bundle({
    entryPoint: resolve("apps/studio/src/index.ts"),
  });
  const composition = await selectComposition({
    serveUrl,
    id: "KnowledgeDemo",
    inputProps: storyboard,
  });
  assertCompositionMetadata(composition);

  await removeExactFileIfPresent(videoTemporaryPath);
  await renderMedia({
    codec: "h264",
    pixelFormat: "yuv420p",
    composition,
    serveUrl,
    inputProps: storyboard,
    outputLocation: videoTemporaryPath,
  });
  await rename(videoTemporaryPath, videoPath);

  const videoStats = await stat(videoPath);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Demo MP4：${videoPath}`);
  console.log(`文件大小：${videoStats.size} bytes`);
  console.log(`总耗时：${elapsedSeconds}s`);
};

await main();
