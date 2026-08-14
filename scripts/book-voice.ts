import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {mkdir, readFile, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {buildNarrationPlan} from "../src/narration/build-narration-plan";
import {atomicWriteJson} from "../src/shared/atomic-write";
import {inspectMediaFile} from "../src/shared/media-inspection";
import {buildVoiceSceneTimings} from "../src/storyboard/voice-timeline";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";
import {assembleVoiceTrack} from "../src/voice/assemble-voice-track";
import {EdgeTtsAdapter} from "../src/voice/edge-tts-adapter";
import {ensureEdgeTtsEnvironment} from "../src/voice/edge-tts-environment";
import {postProcessVoice} from "../src/voice/ffmpeg-voice-postprocessor";
import {synthesizeNarrationBlocks} from "../src/voice/narration-voice-pipeline";
import {getVoicePreset} from "../src/voice/voice-presets";
import {buildBookVideoVoiceFingerprint} from "../src/research/book/book-video-timing";
import {assertCalibratedBookVoiceDuration} from "../src/research/book/book-video-calibration";

export const BOOK_VIDEO_LEAD_IN_MS = 60;
export const BOOK_VIDEO_TAIL_OUT_MS = 300;

const parseJobId = (argv: string[]): string => {
  if (argv.length !== 1 || !argv[0] || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0])) {
    throw new Error("Usage: npm run book:voice -- <job-id>");
  }
  return argv[0];
};

const assertNotSilent = (path: string): Promise<number> => new Promise((resolveVolume, reject) => {
  if (!ffmpegPath) return reject(new Error("ffmpeg-static 未提供可执行文件路径"));
  const child = spawn(ffmpegPath, ["-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"], {stdio: ["ignore", "ignore", "pipe"]});
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", reject);
  child.once("exit", (code) => {
    const match = /mean_volume:\s*(-?[\d.]+) dB/u.exec(stderr);
    const meanVolumeDb = match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
    if (code !== 0 || !Number.isFinite(meanVolumeDb) || meanVolumeDb < -55) {
      return reject(new Error("voice.mp3 无法解码或疑似静音"));
    }
    resolveVolume(meanVolumeDb);
  });
});

export const runBookVoiceCli = async (argv = process.argv.slice(2)): Promise<void> => {
  const jobId = parseJobId(argv);
  const directory = resolve("output", jobId);
  const source = parseVisualStoryboard(JSON.parse(await readFile(resolve(directory, "storyboard.json"), "utf8")));
  if (source.profile !== "book-deep-reading" || source.audio.enabled) {
    throw new Error("book:voice 需要未配音的 book-deep-reading Storyboard");
  }
  const plan = buildNarrationPlan(source);
  const settings = getVoicePreset("natural");
  const fingerprint = buildBookVideoVoiceFingerprint(source, settings);
  const pythonPath = await ensureEdgeTtsEnvironment();
  const adapter = new EdgeTtsAdapter(pythonPath, settings);
  const segmentDirectory = resolve(directory, "voice-segments");
  await mkdir(segmentDirectory, {recursive: true});
  const blocks = await synthesizeNarrationBlocks({provider: adapter, plan, segmentDirectory});
  const rawVoicePath = resolve(directory, "voice.raw.mp3");
  const voicePath = resolve(directory, "voice.mp3");
  await assembleVoiceTrack({
    segments: blocks.map((block, index) => ({
      path: block.trimmed.audioPath,
      pauseAfterMs: index === blocks.length - 1 ? 0 : block.pauseAfterMs,
    })),
    outputPath: rawVoicePath,
    leadInMs: BOOK_VIDEO_LEAD_IN_MS,
    tailOutMs: BOOK_VIDEO_TAIL_OUT_MS,
  });
  const postProcess = await postProcessVoice(rawVoicePath, voicePath);
  const [media, stats, meanVolumeDb] = await Promise.all([
    inspectMediaFile(voicePath), stat(voicePath), assertNotSilent(voicePath),
  ]);
  if (!media.canRead || media.audioTracks.length !== 1 || media.videoTracks.length !== 0) {
    throw new Error("voice.mp3 媒体结构无效");
  }
  assertCalibratedBookVoiceDuration(media.durationMs);
  const sceneTimings = buildVoiceSceneTimings({
    leadInMs: BOOK_VIDEO_LEAD_IN_MS,
    tailOutMs: BOOK_VIDEO_TAIL_OUT_MS,
    audioDurationMs: media.durationMs,
    blocks: blocks.map((block, index) => ({
      durationMs: block.trimmed.durationMs,
      pauseAfterMs: index === blocks.length - 1 ? 0 : block.pauseAfterMs,
      parts: block.parts,
    })),
  });
  if ((sceneTimings[0]?.endMs ?? Number.POSITIVE_INFINITY) > 3000) {
    throw new Error("Primary Hook 实际时长超过 3 秒");
  }
  const manifest = {
    schemaVersion: "1.0",
    jobId,
    provider: adapter.provider,
    preset: "natural" as const,
    ...settings,
    fingerprint,
    durationMs: media.durationMs,
    sizeBytes: stats.size,
    meanVolumeDb,
    postProcess,
    sceneTimings,
  };
  await atomicWriteJson(resolve(directory, "voice.json"), manifest);
  console.log(JSON.stringify({jobId, provider: adapter.provider, preset: "natural", durationMs: media.durationMs, meanVolumeDb}));
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-voice.ts")) {
  await runBookVoiceCli();
}
