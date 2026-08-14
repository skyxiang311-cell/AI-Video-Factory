import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {readFile, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {inspectMediaFile} from "../../shared/media-inspection";
import {BookComicStoryboardSchema} from "./comic-storyboard-schema";
import type {BookComicStoryboard} from "./comic-storyboard-schema";
import {BOOK_VIDEO_BLACKDETECT_FILTER} from "./book-video-verification";
import {parseVisualStoryboard} from "../../storyboard/visual-schema";
import {parseBookVideoVoiceManifest} from "./book-video-timing";

type PacingShot = {
  startMs: number;
  endMs: number;
  turns: Array<{speaker: string}>;
  visualBeats: Array<{atMs: number}>;
};

export const assertComicStoryboardPacing = (shots: PacingShot[]) => {
  if (shots.length < 30 || shots.length > 45) throw new Error("漫画分镜必须为 30–45 个镜头");
  const firstSpeakers = new Set(shots[0]?.turns.map((turn) => turn.speaker));
  if (!firstSpeakers.has("xiaoyuan") || !firstSpeakers.has("douzai")) throw new Error("前三秒 Hook 必须由豆仔与小圆共同完成");
  const durations = shots.map((shot) => shot.endMs - shot.startMs);
  const longestShotMs = Math.max(...durations);
  if (Math.min(...durations) < 3000 || longestShotMs > 8000) throw new Error("漫画镜头必须保持 3–8 秒节奏");
  const gaps = shots.flatMap((shot) => {
    const points = shot.visualBeats.map((beat) => beat.atMs).concat(shot.endMs - shot.startMs);
    return points.slice(1).map((point, index) => point - points[index]!);
  });
  const longestBeatGapMs = Math.max(...gaps);
  if (longestBeatGapMs > 6000) throw new Error("存在超过 6 秒没有有效视觉变化的镜头");
  return {sceneCount: shots.length, longestShotMs, longestBeatGapMs};
};

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

type BindingStoryboard = Pick<BookComicStoryboard, "lockedScriptSha256" | "sourceStoryboardSha256" | "referenceImageSha256" | "captionsSha256" | "audio" | "captions"> & {
  shots: Array<{turns: Array<{sourceSceneId: string; text: string; startMs: number; endMs: number}>; originalSceneIds: string[]; claimIds: string[]; sourceRefs: Array<{type: "book"; chapterId: string; page: number; blockId: string}>}>;
};

export const assertComicContentBindings = (storyboard: BindingStoryboard, bindings: {
  scriptText: string;
  sourceStoryboardText: string;
  voiceBytes: Buffer;
  referenceBytes: Buffer;
  voiceFingerprint: string;
  voiceDurationMs: number;
  subtitleCaptions: unknown[];
  sourceScenes: Array<{id: string; voiceText: string; startMs: number; endMs: number; claimIds: string[]; sourceRefs: Array<{type: "book"; chapterId: string; page: number; blockId: string}>}>;
}): void => {
  if (sha256(bindings.scriptText) !== storyboard.lockedScriptSha256) throw new Error("locked script.json 已变化");
  if (sha256(bindings.sourceStoryboardText) !== storyboard.sourceStoryboardSha256) throw new Error("source storyboard 已变化");
  if (sha256(bindings.voiceBytes) !== storyboard.audio.sha256 || bindings.voiceFingerprint !== storyboard.audio.fingerprint || bindings.voiceDurationMs !== storyboard.audio.durationMs) throw new Error("voice.mp3 或 voice manifest 已变化");
  if (sha256(bindings.referenceBytes) !== storyboard.referenceImageSha256) throw new Error("固定角色参考图已变化");
  const captionsHash = sha256(JSON.stringify(storyboard.captions));
  if (captionsHash !== storyboard.captionsSha256 || sha256(JSON.stringify(bindings.subtitleCaptions)) !== storyboard.captionsSha256) throw new Error("字幕全文或 timing 与锁定版本不一致");
  const sourceById = new Map(bindings.sourceScenes.map((scene) => [scene.id, scene]));
  const mapped = new Set<string>();
  for (const turn of storyboard.shots.flatMap((shot) => shot.turns)) {
    const source = sourceById.get(turn.sourceSceneId);
    if (!source || source.voiceText !== turn.text || source.startMs !== turn.startMs || source.endMs !== turn.endMs) throw new Error(`漫画 turn 与真实 voice scene 不一致：${turn.sourceSceneId}`);
    mapped.add(turn.sourceSceneId);
  }
  if (bindings.sourceScenes.some((scene) => !mapped.has(scene.id))) throw new Error("漫画分镜未完整覆盖真实 voice scenes");
  const stableUnique = (values: string[]) => [...new Set(values)].sort();
  for (const shot of storyboard.shots) {
    const turnSceneIds = stableUnique(shot.turns.map((turn) => turn.sourceSceneId));
    const declaredSceneIds = stableUnique(shot.originalSceneIds);
    const sources = declaredSceneIds.map((id) => sourceById.get(id)).filter((scene): scene is NonNullable<typeof scene> => Boolean(scene));
    const expectedClaims = stableUnique(sources.flatMap((scene) => scene.claimIds));
    const expectedRefs = stableUnique(sources.flatMap((scene) => scene.sourceRefs.map((ref) => `${ref.chapterId}:${ref.page}:${ref.blockId}`)));
    const actualRefs = stableUnique(shot.sourceRefs.map((ref) => `${ref.chapterId}:${ref.page}:${ref.blockId}`));
    if (JSON.stringify(turnSceneIds) !== JSON.stringify(declaredSceneIds) || JSON.stringify(stableUnique(shot.claimIds)) !== JSON.stringify(expectedClaims) || JSON.stringify(actualRefs) !== JSON.stringify(expectedRefs)) throw new Error("漫画镜头 claim/source 追溯绑定不一致");
  }
};

export const loadAndAssertComicArtifactBindings = async (directory: string, storyboard: BookComicStoryboard) => {
  if (storyboard.characterPack.referenceImage !== "comic-scenes/character-reference.png") throw new Error("漫画角色参考图路径不受支持");
  const [scriptText, sourceStoryboardText, voiceManifestText, voiceBytes, referenceBytes, subtitlesText] = await Promise.all([
    readFile(resolve(directory, "script.json"), "utf8"), readFile(resolve(directory, "storyboard.json"), "utf8"),
    readFile(resolve(directory, "voice.json"), "utf8"), readFile(resolve(directory, "voice.mp3")),
    readFile(resolve(directory, storyboard.characterPack.referenceImage)), readFile(resolve(directory, "subtitles.json"), "utf8"),
  ]);
  const source = parseVisualStoryboard(JSON.parse(sourceStoryboardText));
  const voiceManifest = parseBookVideoVoiceManifest(source, JSON.parse(voiceManifestText));
  const subtitles = JSON.parse(subtitlesText) as {captions: unknown[]};
  assertComicContentBindings(storyboard, {
    scriptText, sourceStoryboardText, voiceBytes, referenceBytes,
    voiceFingerprint: voiceManifest.fingerprint, voiceDurationMs: voiceManifest.durationMs,
    subtitleCaptions: subtitles.captions, sourceScenes: source.scenes.map((scene) => ({
      id: scene.id, voiceText: scene.voiceText, startMs: scene.startMs, endMs: scene.endMs,
      claimIds: scene.claimIds,
      sourceRefs: (scene.sourceRefs ?? []).filter((ref): ref is {type: "book"; chapterId: string; page: number; blockId: string} => Boolean(ref)),
    })),
  });
  return {source, voiceManifest};
};

const assertNoBlankRun = (videoPath: string): Promise<void> => new Promise((resolveCheck, reject) => {
  if (!ffmpegPath) return reject(new Error("ffmpeg-static 未提供可执行文件路径"));
  const child = spawn(ffmpegPath, ["-hide_banner", "-i", videoPath, "-vf", BOOK_VIDEO_BLACKDETECT_FILTER, "-an", "-f", "null", "-"], {stdio: ["ignore", "ignore", "pipe"]});
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code !== 0) return reject(new Error("无法执行漫画视频空白画面检查"));
    if (/black_duration:(?:1(?:\.\d+)?|[2-9]\d*(?:\.\d+)?)/u.test(stderr)) return reject(new Error("final-comic.mp4 存在明显空白场景"));
    resolveCheck();
  });
});

export const verifyBookComicVideoOutput = async (jobId: string) => {
  const directory = resolve("output", jobId);
  const storyboard = BookComicStoryboardSchema.parse(JSON.parse(await readFile(resolve(directory, "comic-storyboard.json"), "utf8")));
  await loadAndAssertComicArtifactBindings(directory, storyboard);
  const [voice, video, videoStats] = await Promise.all([
    inspectMediaFile(resolve(directory, "voice.mp3")),
    inspectMediaFile(resolve(directory, "final-comic.mp4")),
    stat(resolve(directory, "final-comic.mp4")),
  ]);
  const videoTrack = video.videoTracks[0];
  const audioTrack = video.audioTracks[0];
  if (!videoTrack || !audioTrack) throw new Error("final-comic.mp4 必须包含视频与音频");
  if (video.durationMs < 270000 || video.durationMs > 330000) throw new Error("漫画视频时长必须在 270–330 秒");
  if (Math.abs(video.durationMs - voice.durationMs) > 2000) throw new Error("漫画视频与原配音时长差异超过 2 秒");
  if (videoTrack.width !== 1080 || videoTrack.height !== 1920 || Math.abs(videoTrack.fps - 30) > .05 || videoTrack.codec !== "avc") throw new Error("漫画视频必须为 1080×1920、30fps、H264");
  if (audioTrack.codec !== "aac") throw new Error("漫画视频音频必须为 AAC");
  if (Math.abs(audioTrack.durationMs - voice.durationMs) > 120) throw new Error("成片 AAC 音轨与锁定 voice.mp3 时长不一致");
  if (storyboard.captions.length < 1 || storyboard.captions.at(-1)!.endMs < voice.durationMs - 2500) throw new Error("漫画字幕未完整覆盖配音");
  const pacing = assertComicStoryboardPacing(storyboard.shots);
  if (videoStats.size < 100000) throw new Error("final-comic.mp4 文件异常小");
  await assertNoBlankRun(resolve(directory, "final-comic.mp4"));
  return {storyboard, voice, video, pacing};
};
