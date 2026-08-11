import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {readFile, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {inspectMediaFile} from "../src/shared/media-inspection";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";
import {VOICE_DEMO_OUTPUT_DIRECTORY} from "./voice-demo";

const decodeMedia = (filePath: string) =>
  new Promise<void>((resolveProcess, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static 未提供可执行文件路径"));
      return;
    }
    const child = spawn(ffmpegPath, ["-v", "error", "-i", filePath, "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveProcess()
        : reject(new Error(`最终 MP4 解码失败：${stderr}`)),
    );
  });

export const verifyDemoOutput = async () => {
  const voicePath = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "voice.mp3");
  const videoPath = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "final.mp4");
  const [storyboardText, voiceManifestText, voice, video, voiceStats, videoStats] =
    await Promise.all([
      readFile(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "storyboard.json"), "utf8"),
      readFile(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "voice.json"), "utf8"),
      inspectMediaFile(voicePath),
      inspectMediaFile(videoPath),
      stat(voicePath),
      stat(videoPath),
    ]);
  const storyboard = parseVisualStoryboard(JSON.parse(storyboardText));
  const voiceManifest = JSON.parse(voiceManifestText) as {
    placeholder: boolean;
    meanVolumeDb: number;
  };
  if (voiceStats.size < 10_000 || voice.audioTracks.length !== 1 || voiceManifest.placeholder) {
    throw new Error("voice.mp3 不是有效的真实配音文件");
  }
  if (!Number.isFinite(voiceManifest.meanVolumeDb) || voiceManifest.meanVolumeDb < -55) {
    throw new Error("voice.mp3 疑似静音");
  }
  const videoTrack = video.videoTracks[0];
  const audioTrack = video.audioTracks[0];
  if (!videoTrack || !audioTrack) {
    throw new Error("final.mp4 必须同时包含视频轨和音频轨");
  }
  if (
    videoTrack.codec !== "avc" ||
    videoTrack.width !== 1080 ||
    videoTrack.height !== 1920 ||
    Math.abs(videoTrack.fps - 30) > 0.05
  ) {
    throw new Error(`final.mp4 视频规格不正确：${JSON.stringify(videoTrack)}`);
  }
  const toleranceMs = 1000 / storyboard.format.fps + 70;
  if (
    Math.abs(voice.durationMs - storyboard.format.durationMs) > 2 ||
    Math.abs(video.durationMs - storyboard.format.durationMs) > toleranceMs ||
    Math.abs(audioTrack.durationMs - storyboard.format.durationMs) > toleranceMs
  ) {
    throw new Error("最终视频、音频轨与 Storyboard 时长不一致");
  }
  if (storyboard.captions.some((caption) => caption.startMs < 0 || caption.endMs > storyboard.format.durationMs)) {
    throw new Error("存在越界字幕");
  }
  if (videoStats.size < 100_000) {
    throw new Error("final.mp4 文件异常小");
  }
  await decodeMedia(videoPath);
  return {storyboard, voice, video, voiceStats, videoStats, voiceManifest};
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/verify-demo.ts")) {
  const result = await verifyDemoOutput();
  console.log(JSON.stringify(result, null, 2));
}
