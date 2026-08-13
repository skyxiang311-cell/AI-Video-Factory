import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {finalizeBookVideoStoryboard, parseBookVideoVoiceManifest} from "../src/research/book/book-video-timing";
import {atomicWriteJson} from "../src/shared/atomic-write";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";
import {inspectMediaFile} from "../src/shared/media-inspection";

const parseJobId = (argv: string[]): string => {
  if (argv.length !== 1 || !argv[0] || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0])) {
    throw new Error("Usage: npm run book:subtitles -- <job-id>");
  }
  return argv[0];
};

export const runBookSubtitlesCli = async (argv = process.argv.slice(2)): Promise<void> => {
  const jobId = parseJobId(argv);
  const directory = resolve("output", jobId);
  const [storyboardText, voiceText] = await Promise.all([
    readFile(resolve(directory, "storyboard.json"), "utf8"),
    readFile(resolve(directory, "voice.json"), "utf8"),
  ]);
  const source = parseVisualStoryboard(JSON.parse(storyboardText));
  const voice = parseBookVideoVoiceManifest(source, JSON.parse(voiceText));
  const voiceMedia = await inspectMediaFile(resolve(directory, "voice.mp3"));
  if (voiceMedia.audioTracks.length !== 1 || Math.abs(voiceMedia.durationMs - voice.durationMs) > 2) {
    throw new Error("voice.mp3 与 voice manifest 时长不一致");
  }
  const storyboard = finalizeBookVideoStoryboard({
    source,
    audio: {
      src: "voice.mp3",
      provider: voice.provider,
      voice: voice.voice,
      rate: voice.rate,
      pitch: voice.pitch,
      volume: voice.volume,
      preset: voice.preset,
      durationMs: voice.durationMs,
      fingerprint: voice.fingerprint,
    },
    sceneTimings: voice.sceneTimings,
  });
  const subtitles = {
    schemaVersion: storyboard.schemaVersion,
    jobId,
    durationMs: storyboard.format.durationMs,
    captions: storyboard.captions,
  };
  await Promise.all([
    atomicWriteJson(resolve(directory, "storyboard.json"), storyboard),
    atomicWriteJson(resolve(directory, "subtitles.json"), subtitles),
  ]);
  console.log(JSON.stringify({jobId, durationMs: storyboard.format.durationMs, scenes: storyboard.scenes.length, subtitles: storyboard.captions.length}));
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-subtitles.ts")) {
  await runBookSubtitlesCli();
}
