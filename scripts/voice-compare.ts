import {mkdir, readFile, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {normalizeSpeechText} from "../src/narration/normalize-speech";
import {atomicWriteJson} from "../src/shared/atomic-write";
import {inspectMediaFile} from "../src/shared/media-inspection";
import {assembleVoiceTrack} from "../src/voice/assemble-voice-track";
import {EdgeTtsAdapter} from "../src/voice/edge-tts-adapter";
import {ensureEdgeTtsEnvironment} from "../src/voice/edge-tts-environment";
import {postProcessVoice} from "../src/voice/ffmpeg-voice-postprocessor";
import {trimVoiceSegment} from "../src/voice/trim-voice-segment";
import {VOICE_PRESETS, type VoicePresetName} from "../src/voice/voice-presets";
import {assertAudioIsNotSilent} from "./voice-demo";

const OUTPUT_DIRECTORY = resolve("output", "voice-comparison");
const presetNames = Object.keys(VOICE_PRESETS) as VoicePresetName[];

const main = async () => {
  const fixture = JSON.parse(
    await readFile(resolve("templates/knowledge/voice-comparison.json"), "utf8"),
  ) as {schemaVersion: string; text: string};
  const normalized = normalizeSpeechText(fixture.text);
  const pythonPath = await ensureEdgeTtsEnvironment();
  await mkdir(resolve(OUTPUT_DIRECTORY, "segments"), {recursive: true});
  const results = [];
  for (const presetName of presetNames) {
    const settings = VOICE_PRESETS[presetName];
    console.log(`生成试听预设：${presetName}`);
    const adapter = new EdgeTtsAdapter(pythonPath, settings);
    const raw = await adapter.synthesize({
      segmentId: `comparison-${presetName}`,
      text: normalized.text,
      audioPath: resolve(OUTPUT_DIRECTORY, "segments", `${presetName}.raw.mp3`),
    });
    const trimmed = await trimVoiceSegment(
      raw,
      resolve(OUTPUT_DIRECTORY, "segments", `${presetName}.trimmed.mp3`),
    );
    const assembled = resolve(OUTPUT_DIRECTORY, "segments", `${presetName}.assembled.mp3`);
    const outputPath = resolve(OUTPUT_DIRECTORY, `${presetName}.mp3`);
    await assembleVoiceTrack({
      segments: [{path: trimmed.audioPath, pauseAfterMs: 0}],
      outputPath: assembled,
      leadInMs: 60,
      tailOutMs: 220,
    });
    const postProcess = await postProcessVoice(assembled, outputPath);
    const [media, fileStats, meanVolumeDb] = await Promise.all([
      inspectMediaFile(outputPath), stat(outputPath), assertAudioIsNotSilent(outputPath),
    ]);
    results.push({
      preset: presetName,
      settings,
      path: outputPath,
      durationMs: media.durationMs,
      sizeBytes: fileStats.size,
      meanVolumeDb,
      trim: {startMs: trimmed.trimStartMs, endMs: trimmed.trimEndMs},
      postProcess,
    });
    console.log(`${presetName}: ${outputPath} (${(media.durationMs / 1000).toFixed(3)}s)`);
  }
  await atomicWriteJson(resolve(OUTPUT_DIRECTORY, "comparison.json"), {
    schemaVersion: "1.0",
    sourceText: fixture.text,
    normalizedText: normalized.text,
    results,
  });
};

await main();
