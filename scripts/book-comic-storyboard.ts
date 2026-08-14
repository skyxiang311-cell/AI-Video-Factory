import {createHash} from "node:crypto";
import {copyFile, mkdir, readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {BookDeepScriptSchema} from "../src/research/book/book-script-schema";
import {buildBookComicStoryboard, buildDefaultComicCharacterPack} from "../src/research/book/book-comic-storyboard";
import {assertComicStoryboardPacing} from "../src/research/book/book-comic-verification";
import {parseBookVideoVoiceManifest} from "../src/research/book/book-video-timing";
import {atomicWriteJson} from "../src/shared/atomic-write";
import {inspectMediaFile} from "../src/shared/media-inspection";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";

const parseJobId = (argv: string[]): string => {
  if (argv.length !== 1 || !argv[0] || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0])) throw new Error("Usage: npm run book:comic-storyboard -- <job-id>");
  return argv[0];
};

export const runBookComicStoryboardCli = async (argv = process.argv.slice(2)): Promise<void> => {
  const jobId = parseJobId(argv);
  const directory = resolve("output", jobId);
  const [scriptText, sourceText, voiceText, voiceBytes, referenceBytes] = await Promise.all([
    readFile(resolve(directory, "script.json"), "utf8"),
    readFile(resolve(directory, "storyboard.json"), "utf8"),
    readFile(resolve(directory, "voice.json"), "utf8"),
    readFile(resolve(directory, "voice.mp3")),
    readFile(resolve("assets/book-comic/xiaoyuan-douzai-reference.png")),
  ]);
  const script = BookDeepScriptSchema.parse(JSON.parse(scriptText));
  if (script.quality.status !== "PASS" || script.quality.blockingIssues.length > 0) throw new Error("锁定 script.json 必须已通过质量门");
  const source = parseVisualStoryboard(JSON.parse(sourceText));
  if (source.profile !== "book-deep-reading" || !source.audio.enabled || source.audio.src !== "voice.mp3") throw new Error("需要已完成配音的 Book Deep Reading Storyboard");
  const voiceManifest = parseBookVideoVoiceManifest(source, JSON.parse(voiceText));
  const voice = await inspectMediaFile(resolve(directory, "voice.mp3"));
  if (Math.abs(voice.durationMs - source.format.durationMs) > 2) throw new Error("现有 voice.mp3 与 Storyboard timing 不一致");

  const scenesDirectory = resolve(directory, "comic-scenes");
  await mkdir(scenesDirectory, {recursive: true});
  await copyFile(resolve("assets/book-comic/xiaoyuan-douzai-reference.png"), resolve(scenesDirectory, "character-reference.png"));
  const characterPack = buildDefaultComicCharacterPack("comic-scenes/character-reference.png");
  const storyboard = buildBookComicStoryboard({
    jobId, source, characterPack,
    lockedScriptSha256: createHash("sha256").update(scriptText).digest("hex"),
    sourceStoryboardSha256: createHash("sha256").update(sourceText).digest("hex"),
    referenceImageSha256: createHash("sha256").update(referenceBytes).digest("hex"),
    captionsSha256: createHash("sha256").update(JSON.stringify(source.captions)).digest("hex"),
    audio: {fingerprint: voiceManifest.fingerprint, durationMs: voiceManifest.durationMs, sha256: createHash("sha256").update(voiceBytes).digest("hex")},
  });
  const pacing = assertComicStoryboardPacing(storyboard.shots);
  await Promise.all([
    atomicWriteJson(resolve(directory, "comic-character-pack.json"), characterPack),
    atomicWriteJson(resolve(directory, "comic-storyboard.json"), storyboard),
    ...storyboard.shots.map((shot) => atomicWriteJson(resolve(scenesDirectory, `${shot.id}.json`), shot)),
  ]);
  console.log(JSON.stringify({jobId, scenes: pacing.sceneCount, subtitles: storyboard.captions.length, voiceReused: true, durationMs: storyboard.format.durationMs}));
};

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/book-comic-storyboard.ts")) await runBookComicStoryboardCli();
