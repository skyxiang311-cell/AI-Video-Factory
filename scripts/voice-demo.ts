import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {mkdir, readFile, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {atomicWriteJson} from "../src/shared/atomic-write";
import {createDemoArtifacts} from "../src/shared/demo-artifacts";
import {inspectMediaFile} from "../src/shared/media-inspection";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";
import {resolveVoiceDrivenStoryboard} from "../src/storyboard/voice-timeline";
import {assembleVoiceTrack} from "../src/voice/assemble-voice-track";
import {
  buildVoiceFingerprint,
  EdgeTtsAdapter,
  type EdgeVoiceSettings,
} from "../src/voice/edge-tts-adapter";
import {ensureEdgeTtsEnvironment} from "../src/voice/edge-tts-environment";
import sampleStoryboardJson from "../templates/knowledge/sample-storyboard.json";

export const VOICE_DEMO_JOB_ID = "knowledge-voice-demo";
export const VOICE_DEMO_OUTPUT_DIRECTORY = resolve("output", VOICE_DEMO_JOB_ID);
export const VOICE_SETTINGS: EdgeVoiceSettings = {
  voice: "zh-CN-XiaoxiaoNeural",
  rate: "+5%",
  pitch: "+0Hz",
  volume: "+0%",
};

const expectedFingerprint = () =>
  buildVoiceFingerprint({
    ...VOICE_SETTINGS,
    texts: sampleStoryboardJson.scenes.map((scene) => scene.voiceText),
  });

const assertAudioIsNotSilent = async (audioPath: string): Promise<number> =>
  new Promise((resolveVolume, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static 未提供可执行文件路径"));
      return;
    }
    const child = spawn(ffmpegPath, [
      "-hide_banner",
      "-i",
      audioPath,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error("无法解码生成的 voice.mp3"));
        return;
      }
      const match = /mean_volume:\s*(-?[\d.]+) dB/u.exec(stderr);
      const meanVolumeDb = match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
      if (!Number.isFinite(meanVolumeDb) || meanVolumeDb < -55) {
        reject(new Error(`voice.mp3 疑似静音，mean_volume=${String(meanVolumeDb)} dB`));
        return;
      }
      resolveVolume(meanVolumeDb);
    });
  });

export const generateDemoVoice = async () => {
  const source = parseVisualStoryboard({
    ...sampleStoryboardJson,
    jobId: VOICE_DEMO_JOB_ID,
  });
  const pythonPath = await ensureEdgeTtsEnvironment();
  const segmentDirectory = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "segments");
  await mkdir(segmentDirectory, {recursive: true});

  const adapter = new EdgeTtsAdapter(pythonPath, VOICE_SETTINGS);
  const fingerprint = expectedFingerprint();
  const segments = [];
  for (const [index, scene] of source.scenes.entries()) {
    console.log(`生成配音 ${index + 1}/${source.scenes.length}：${scene.id}`);
    segments.push(
      await adapter.synthesize({
        sceneId: scene.id,
        text: scene.voiceText,
        audioPath: resolve(segmentDirectory, `${scene.id}.mp3`),
      }),
    );
  }

  const voicePath = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "voice.mp3");
  await assembleVoiceTrack({
    segmentPaths: segments.map((segment) => segment.audioPath),
    outputPath: voicePath,
    leadInMs: 60,
    pauseAfterMs: 100,
    tailOutMs: 300,
  });
  const [voiceMedia, voiceStats, meanVolumeDb] = await Promise.all([
    inspectMediaFile(voicePath),
    stat(voicePath),
    assertAudioIsNotSilent(voicePath),
  ]);
  if (!voiceMedia.canRead || voiceMedia.audioTracks.length !== 1 || voiceMedia.videoTracks.length !== 0) {
    throw new Error("voice.mp3 媒体结构无效");
  }

  const storyboard = resolveVoiceDrivenStoryboard({
    source,
    audio: {
      src: "voice.mp3",
      provider: adapter.provider,
      voice: VOICE_SETTINGS.voice,
      rate: VOICE_SETTINGS.rate,
      durationMs: voiceMedia.durationMs,
      fingerprint,
    },
    segments: segments.map((segment) => ({
      sceneId: segment.sceneId,
      durationMs: segment.durationMs,
      boundaries: segment.boundaries,
    })),
    leadInMs: 60,
    pauseAfterMs: 100,
    tailOutMs: 300,
  });
  const artifacts = createDemoArtifacts(storyboard);
  const voiceManifest = {
    schemaVersion: "1.0",
    jobId: storyboard.jobId,
    provider: adapter.provider,
    placeholder: false,
    voice: VOICE_SETTINGS.voice,
    rate: VOICE_SETTINGS.rate,
    pitch: VOICE_SETTINGS.pitch,
    volume: VOICE_SETTINGS.volume,
    fingerprint,
    durationMs: voiceMedia.durationMs,
    sizeBytes: voiceStats.size,
    meanVolumeDb,
    segments: segments.map((segment) => ({
      sceneId: segment.sceneId,
      text: segment.text,
      durationMs: segment.durationMs,
      boundaryCount: segment.boundaries.length,
      boundaries: segment.boundaries,
    })),
  };

  await Promise.all([
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "source.json"), artifacts.source),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "analysis.json"), artifacts.analysis),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "script.json"), artifacts.script),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "storyboard.json"), storyboard),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "subtitles.json"), artifacts.subtitles),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "assets.json"), artifacts.assets),
    atomicWriteJson(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "voice.json"), voiceManifest),
  ]);

  console.log(`voice.mp3：${voicePath}`);
  console.log(`配音时长：${(voiceMedia.durationMs / 1000).toFixed(3)}s`);
  console.log(`文件大小：${voiceStats.size} bytes`);
  console.log(`平均音量：${meanVolumeDb.toFixed(1)} dB`);
  return {storyboard, voiceManifest, voicePath};
};

export const ensureDemoVoice = async () => {
  try {
    const storyboard = parseVisualStoryboard(
      JSON.parse(
        await readFile(resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "storyboard.json"), "utf8"),
      ),
    );
    const voicePath = resolve(VOICE_DEMO_OUTPUT_DIRECTORY, "voice.mp3");
    const media = await inspectMediaFile(voicePath);
    if (
      storyboard.audio.enabled &&
      storyboard.audio.fingerprint === expectedFingerprint() &&
      media.audioTracks.length === 1 &&
      Math.abs(media.durationMs - storyboard.audio.durationMs) <= 2
    ) {
      return {storyboard, voicePath};
    }
  } catch {
    // Missing or stale output is regenerated below.
  }
  return generateDemoVoice();
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/voice-demo.ts")) {
  await generateDemoVoice();
}
