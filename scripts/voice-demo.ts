import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {mkdir, readFile, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {buildNarrationPlan} from "../src/narration/build-narration-plan";
import {atomicWriteJson} from "../src/shared/atomic-write";
import {createDemoArtifacts} from "../src/shared/demo-artifacts";
import {inspectMediaFile} from "../src/shared/media-inspection";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";
import {
  buildVoiceSceneTimings,
  resolveVoiceDrivenStoryboardFromTimings,
} from "../src/storyboard/voice-timeline";
import {assembleVoiceTrack} from "../src/voice/assemble-voice-track";
import {buildVoiceFingerprint, EdgeTtsAdapter} from "../src/voice/edge-tts-adapter";
import {ensureEdgeTtsEnvironment} from "../src/voice/edge-tts-environment";
import {postProcessVoice} from "../src/voice/ffmpeg-voice-postprocessor";
import {synthesizeNarrationBlocks} from "../src/voice/narration-voice-pipeline";
import {getVoicePreset} from "../src/voice/voice-presets";
import sampleStoryboardJson from "../templates/knowledge/sample-storyboard.json";

export const VOICE_DEMO_JOB_ID = "knowledge-voice-demo";
export const VOICE_DEMO_OUTPUT_DIRECTORY = resolve("output", VOICE_DEMO_JOB_ID);
export const LEAD_IN_MS = 60;
export const TAIL_OUT_MS = 300;

const sourceStoryboard = () => parseVisualStoryboard({
  ...sampleStoryboardJson,
  jobId: VOICE_DEMO_JOB_ID,
});

export const buildDemoVoiceFingerprint = (source: ReturnType<typeof sourceStoryboard>) => {
  const plan = buildNarrationPlan(source);
  const settings = getVoicePreset(plan.preset);
  return buildVoiceFingerprint({
    ...settings,
    texts: [
      plan.preset,
      JSON.stringify(source),
      ...plan.blocks.flatMap((block) => [block.text, block.pauseAfter, String(block.pauseAfterMs)]),
      String(LEAD_IN_MS),
      String(TAIL_OUT_MS),
      "edge-trim-60-90",
      "ffmpeg-light-voice-v1",
    ],
  });
};

const expectedFingerprint = () => buildDemoVoiceFingerprint(sourceStoryboard());

export const assertAudioIsNotSilent = async (audioPath: string): Promise<number> =>
  new Promise((resolveVolume, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg-static 未提供可执行文件路径"));
    const child = spawn(ffmpegPath, [
      "-hide_banner", "-i", audioPath, "-af", "volumedetect", "-f", "null", "-",
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) return reject(new Error("无法解码生成的 voice.mp3"));
      const match = /mean_volume:\s*(-?[\d.]+) dB/u.exec(stderr);
      const meanVolumeDb = match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
      if (!Number.isFinite(meanVolumeDb) || meanVolumeDb < -55) {
        return reject(new Error(`voice.mp3 疑似静音，mean_volume=${String(meanVolumeDb)} dB`));
      }
      resolveVolume(meanVolumeDb);
    });
  });

export const generateDemoVoice = async () => {
  const source = sourceStoryboard();
  const plan = buildNarrationPlan(source);
  const settings = getVoicePreset(plan.preset);
  const pythonPath = await ensureEdgeTtsEnvironment();
  const segmentDirectory = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "segments");
  await mkdir(segmentDirectory, {recursive: true});
  const adapter = new EdgeTtsAdapter(pythonPath, settings);
  const fingerprint = buildDemoVoiceFingerprint(source);
  const blocks = await synthesizeNarrationBlocks({
    provider: adapter,
    plan,
    segmentDirectory,
  });

  const rawVoicePath = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "voice.raw.mp3");
  const voicePath = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "voice.mp3");
  await assembleVoiceTrack({
    segments: blocks.map((block, index) => ({
      path: block.trimmed.audioPath,
      pauseAfterMs: index === blocks.length - 1 ? 0 : block.pauseAfterMs,
    })),
    outputPath: rawVoicePath,
    leadInMs: LEAD_IN_MS,
    tailOutMs: TAIL_OUT_MS,
  });
  const postProcess = await postProcessVoice(rawVoicePath, voicePath);
  const [voiceMedia, voiceStats, meanVolumeDb] = await Promise.all([
    inspectMediaFile(voicePath), stat(voicePath), assertAudioIsNotSilent(voicePath),
  ]);
  if (!voiceMedia.canRead || voiceMedia.audioTracks.length !== 1 || voiceMedia.videoTracks.length !== 0) {
    throw new Error("voice.mp3 媒体结构无效");
  }

  const sceneTimings = buildVoiceSceneTimings({
    leadInMs: LEAD_IN_MS,
    tailOutMs: TAIL_OUT_MS,
    audioDurationMs: voiceMedia.durationMs,
    blocks: blocks.map((block, index) => ({
      durationMs: block.trimmed.durationMs,
      pauseAfterMs: index === blocks.length - 1 ? 0 : block.pauseAfterMs,
      parts: block.parts,
    })),
  });
  const storyboard = resolveVoiceDrivenStoryboardFromTimings({
    source,
    audio: {
      src: "voice.mp3",
      provider: adapter.provider,
      voice: settings.voice,
      rate: settings.rate,
      pitch: settings.pitch,
      volume: settings.volume,
      preset: plan.preset,
      durationMs: voiceMedia.durationMs,
      fingerprint,
    },
    sceneTimings,
  });
  const artifacts = createDemoArtifacts(storyboard);
  const voiceManifest = {
    schemaVersion: "1.1",
    jobId: storyboard.jobId,
    provider: adapter.provider,
    placeholder: false,
    preset: plan.preset,
    ...settings,
    fingerprint,
    durationMs: voiceMedia.durationMs,
    sizeBytes: voiceStats.size,
    meanVolumeDb,
    postProcess,
    blocks: blocks.map((block) => ({
      id: block.id,
      text: block.text,
      pauseAfter: block.pauseAfter,
      declaredPauseAfterMs: block.pauseAfterMs,
      effectivePauseAfterMs: block.id === blocks.at(-1)?.id ? TAIL_OUT_MS : block.pauseAfterMs,
      rawDurationMs: block.raw.durationMs,
      trimmedDurationMs: block.trimmed.durationMs,
      removedLeadingMs: block.trimmed.trimStartMs,
      removedTrailingMs: block.raw.durationMs - block.trimmed.trimEndMs,
      boundaryCount: block.trimmed.boundaries.length,
      pauseAnalysis: block.pauseAnalysis,
      parts: block.parts,
    })),
  };

  await Promise.all([
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "source.json"), artifacts.source),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "analysis.json"), artifacts.analysis),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "script.json"), artifacts.script),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "storyboard.json"), storyboard),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "subtitles.json"), artifacts.subtitles),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "assets.json"), artifacts.assets),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "narration.json"), plan),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "voice.json"), voiceManifest),
  ]);
  console.log(`默认预设：${plan.preset}`);
  console.log(`voice.mp3：${voicePath}`);
  console.log(`配音时长：${(voiceMedia.durationMs / 1000).toFixed(3)}s`);
  console.log(`文件大小：${voiceStats.size} bytes`);
  console.log(`平均音量：${meanVolumeDb.toFixed(1)} dB`);
  return {storyboard, voiceManifest, voicePath};
};

export const ensureDemoVoice = async () => {
  try {
    const storyboard = parseVisualStoryboard(JSON.parse(
      await readFile(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "storyboard.json"), "utf8"),
    ));
    const voicePath = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "voice.mp3");
    const media = await inspectMediaFile(voicePath);
    if (
      storyboard.audio.enabled &&
      storyboard.audio.fingerprint === expectedFingerprint() &&
      storyboard.audio.preset === "natural" &&
      media.audioTracks.length === 1 &&
      Math.abs(media.durationMs - storyboard.audio.durationMs) <= 2
    ) return {storyboard, voicePath};
  } catch {
    // Missing or stale output is regenerated below.
  }
  return generateDemoVoice();
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/voice-demo.ts")) {
  await generateDemoVoice();
}
