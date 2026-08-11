import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {rename, unlink} from "node:fs/promises";

type AssembleVoiceTrackInput = {
  segments: Array<{path: string; pauseAfterMs: number}>;
  outputPath: string;
  leadInMs: number;
  tailOutMs: number;
};

const runFfmpeg = (args: string[]) =>
  new Promise<void>((resolveProcess, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static 未提供可执行文件路径"));
      return;
    }
    const child = spawn(ffmpegPath, args, {stdio: "inherit"});
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveProcess()
        : reject(new Error(`FFmpeg exited with code ${String(code)}`)),
    );
  });

export const assembleVoiceTrack = async ({
  segments,
  outputPath,
  leadInMs,
  tailOutMs,
}: AssembleVoiceTrackInput): Promise<void> => {
  if (segments.length === 0) {
    throw new Error("至少需要一个配音片段");
  }
  const temporaryPath = outputPath.replace(/\.mp3$/u, ".tmp.mp3");
  await unlink(temporaryPath).catch(() => undefined);
  const filters: string[] = [];
  const labels: string[] = [];
  const addSilence = (name: string, durationMs: number) => {
    filters.push(`aevalsrc=0:d=${durationMs / 1000}:s=24000,aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono[${name}]`);
    labels.push(`[${name}]`);
  };
  if (leadInMs > 0) {
    addSilence("lead", leadInMs);
  }
  segments.forEach((segment, index) => {
    filters.push(`[${index}:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono[s${index}]`);
    labels.push(`[s${index}]`);
    const isLast = index === segments.length - 1;
    const silenceMs = isLast ? tailOutMs : segment.pauseAfterMs;
    if (silenceMs > 0) {
      addSilence(isLast ? "tail" : `gap${index}`, silenceMs);
    }
  });
  filters.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[outa]`);
  await runFfmpeg([
    "-y",
    ...segments.flatMap((segment) => ["-i", segment.path]),
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[outa]",
    "-c:a",
    "libmp3lame",
    "-ar",
    "24000",
    "-ac",
    "1",
    "-b:a",
    "64k",
    temporaryPath,
  ]);
  await rename(temporaryPath, outputPath);
};
