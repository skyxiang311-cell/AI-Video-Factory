import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";
import {rename, stat, unlink} from "node:fs/promises";
import {resolve} from "node:path";
import {VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH} from "../src/shared/video-constants";
import {ensureDemoVoice, VOICE_DEMO_OUTPUT_DIRECTORY} from "./voice-demo";
import {verifyDemoOutput} from "./verify-demo";

const removeExactFileIfPresent = async (filePath: string): Promise<void> => {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
};

const main = async (): Promise<void> => {
  const startedAt = Date.now();
  const {storyboard} = await ensureDemoVoice();
  const videoTemporaryPath = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "final.tmp.mp4");
  const videoPath = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "final.mp4");
  const serveUrl = await bundle({
    entryPoint: resolve("apps/studio/src/index.ts"),
    publicDir: VOICE_DEMO_OUTPUT_DIRECTORY,
  });
  const composition = await selectComposition({
    serveUrl,
    id: "KnowledgeDemo",
    inputProps: storyboard,
  });
  const expectedFrames = Math.ceil((storyboard.format.durationMs / 1000) * VIDEO_FPS);
  if (
    composition.width !== VIDEO_WIDTH ||
    composition.height !== VIDEO_HEIGHT ||
    composition.fps !== VIDEO_FPS ||
    composition.durationInFrames !== expectedFrames
  ) {
    throw new Error(
      `Composition 元数据不符合预期：${composition.width}×${composition.height}，${composition.fps}fps，${composition.durationInFrames} 帧`,
    );
  }

  await removeExactFileIfPresent(videoTemporaryPath);
  await renderMedia({
    codec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    composition,
    serveUrl,
    inputProps: storyboard,
    outputLocation: videoTemporaryPath,
  });
  await rename(videoTemporaryPath, videoPath);
  const verification = await verifyDemoOutput();
  const videoStats = await stat(videoPath);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Demo MP4：${videoPath}`);
  console.log(`视频时长：${(verification.video.durationMs / 1000).toFixed(3)}s`);
  console.log(`文件大小：${videoStats.size} bytes`);
  console.log(`音频轨：${verification.video.audioTracks[0]?.codec ?? "missing"}`);
  console.log(`总耗时：${elapsedSeconds}s`);
};

await main();
