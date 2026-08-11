import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {rename, unlink} from "node:fs/promises";
import {inspectMediaFile} from "../shared/media-inspection";

export type VoicePostProcessReport = {
  processor: "ffmpeg-light-voice-v1";
  filters: string[];
  inputDurationMs: number;
  outputDurationMs: number;
};

export interface VoicePostProcessor {
  process(inputPath: string, outputPath: string): Promise<VoicePostProcessReport>;
}

const FILTERS = [
  "highpass=f=70",
  "acompressor=threshold=0.125:ratio=1.5:attack=15:release=120",
  "loudnorm=I=-16:TP=-1.5:LRA=7",
];

export const postProcessVoice = async (
  inputPath: string,
  outputPath: string,
): Promise<VoicePostProcessReport> => {
  if (!ffmpegPath) throw new Error("ffmpeg-static 未提供可执行文件路径");
  const temporaryPath = outputPath.replace(/\.mp3$/u, ".tmp.mp3");
  await unlink(temporaryPath).catch(() => undefined);
  await new Promise<void>((resolveProcess, reject) => {
    const child = spawn(ffmpegPath!, [
      "-y", "-i", inputPath, "-af", FILTERS.join(","),
      "-c:a", "libmp3lame", "-ar", "24000", "-ac", "1", "-b:a", "64k",
      temporaryPath,
    ], {stdio: "inherit"});
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolveProcess()
      : reject(new Error(`FFmpeg voice post-process exited with code ${String(code)}`)));
  });
  await rename(temporaryPath, outputPath);
  const [input, output] = await Promise.all([
    inspectMediaFile(inputPath),
    inspectMediaFile(outputPath),
  ]);
  if (output.audioTracks.length !== 1 || Math.abs(input.durationMs - output.durationMs) > 100) {
    throw new Error("轻量人声后处理改变了音频结构或时长");
  }
  return {
    processor: "ffmpeg-light-voice-v1",
    filters: FILTERS,
    inputDurationMs: input.durationMs,
    outputDurationMs: output.durationMs,
  };
};

export const ffmpegVoicePostProcessor: VoicePostProcessor = {
  process: postProcessVoice,
};
