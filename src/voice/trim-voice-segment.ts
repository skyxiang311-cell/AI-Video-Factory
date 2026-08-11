import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {rename, unlink} from "node:fs/promises";
import {inspectMediaFile} from "../shared/media-inspection";
import type {VoiceSynthesisResult} from "./voice-provider";
import {
  calculateTrimWindow,
  shiftBoundariesAfterTrim,
} from "./voice-segment-processing";

const runFfmpeg = (args: string[]) => new Promise<void>((resolveProcess, reject) => {
  if (!ffmpegPath) return reject(new Error("ffmpeg-static 未提供可执行文件路径"));
  const child = spawn(ffmpegPath, args, {stdio: "inherit"});
  child.once("error", reject);
  child.once("exit", (code) => code === 0
    ? resolveProcess()
    : reject(new Error(`FFmpeg trim exited with code ${String(code)}`)));
});

export type TrimmedVoiceSegment = VoiceSynthesisResult & {
  sourceAudioPath: string;
  trimStartMs: number;
  trimEndMs: number;
};

export const trimVoiceSegment = async (
  source: VoiceSynthesisResult,
  outputPath: string,
): Promise<TrimmedVoiceSegment> => {
  const window = calculateTrimWindow(source);
  const temporaryPath = outputPath.replace(/\.mp3$/u, ".tmp.mp3");
  await unlink(temporaryPath).catch(() => undefined);
  await runFfmpeg([
    "-y", "-i", source.audioPath,
    "-af", `atrim=start=${window.startMs / 1000}:end=${window.endMs / 1000},asetpts=PTS-STARTPTS`,
    "-c:a", "libmp3lame", "-ar", "24000", "-ac", "1", "-b:a", "64k",
    temporaryPath,
  ]);
  await rename(temporaryPath, outputPath);
  const media = await inspectMediaFile(outputPath);
  if (!media.canRead || media.audioTracks.length !== 1 || media.durationMs <= 0) {
    throw new Error(`裁剪后的配音无效：${source.segmentId}`);
  }
  return {
    ...source,
    audioPath: outputPath,
    sourceAudioPath: source.audioPath,
    durationMs: media.durationMs,
    boundaries: shiftBoundariesAfterTrim(source.boundaries, window.startMs),
    trimStartMs: window.startMs,
    trimEndMs: window.endMs,
  };
};
