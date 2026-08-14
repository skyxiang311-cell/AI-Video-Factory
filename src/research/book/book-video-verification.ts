import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {readFile, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {inspectMediaFile} from "../../shared/media-inspection";
import {parseVisualStoryboard} from "../../storyboard/visual-schema";
import {buildNarrationPlan} from "../../narration/build-narration-plan";

export const BOOK_VIDEO_BLACKDETECT_FILTER = "blackdetect=d=1:pix_th=0.10:pic_th=0.99";

export const longestStaticVisualDurationMs = (
  scenes: Array<{startMs: number; endMs: number}>,
): number => Math.max(0, ...scenes.map((scene) => scene.endMs - scene.startMs));

export const assertBookVideoDurationRange = (voiceDurationMs: number, videoDurationMs: number): void => {
  if (voiceDurationMs < 285_000 || voiceDurationMs > 315_000) {
    throw new Error(`voice.mp3 真实时长必须在 285–315 秒，实际 ${(voiceDurationMs / 1000).toFixed(3)} 秒`);
  }
  if (videoDurationMs < 270_000 || videoDurationMs > 330_000) {
    throw new Error(`final.mp4 真实时长必须在 270–330 秒，实际 ${(videoDurationMs / 1000).toFixed(3)} 秒`);
  }
};

const assertNoBlankRun = (videoPath: string): Promise<void> => new Promise((resolveCheck, reject) => {
  if (!ffmpegPath) return reject(new Error("ffmpeg-static 未提供可执行文件路径"));
  const child = spawn(ffmpegPath, [
    "-hide_banner", "-i", videoPath, "-vf", BOOK_VIDEO_BLACKDETECT_FILTER, "-an", "-f", "null", "-",
  ], {stdio: ["ignore", "ignore", "pipe"]});
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code !== 0) return reject(new Error("无法执行空白画面检查"));
    if (/black_duration:(?:1(?:\.\d+)?|[2-9]\d*(?:\.\d+)?)/u.test(stderr)) {
      return reject(new Error("final.mp4 存在持续一秒以上的明显空白场景"));
    }
    resolveCheck();
  });
});

export const verifyBookVideoOutput = async (jobId: string) => {
  const directory = resolve("output", jobId);
  const [storyboardText, subtitlesText, voiceManifestText, voice, video, voiceStats, videoStats] = await Promise.all([
    readFile(resolve(directory, "storyboard.json"), "utf8"),
    readFile(resolve(directory, "subtitles.json"), "utf8"),
    readFile(resolve(directory, "voice.json"), "utf8"),
    inspectMediaFile(resolve(directory, "voice.mp3")),
    inspectMediaFile(resolve(directory, "final.mp4")),
    stat(resolve(directory, "voice.mp3")),
    stat(resolve(directory, "final.mp4")),
  ]);
  const storyboard = parseVisualStoryboard(JSON.parse(storyboardText));
  const subtitles = JSON.parse(subtitlesText) as {captions: Array<{text: string}>};
  const voiceManifest = JSON.parse(voiceManifestText) as {
    jobId: string;
    fingerprint: string;
    durationMs: number;
    sceneTimings: Array<{sceneId: string; text: string}>;
  };
  const videoTrack = video.videoTracks[0];
  const audioTrack = video.audioTracks[0];
  const normalizedParts = buildNarrationPlan(storyboard).blocks.flatMap((block) => block.parts);
  if (!videoTrack || !audioTrack) throw new Error("final.mp4 必须同时包含视频和音频");
  assertBookVideoDurationRange(voice.durationMs, video.durationMs);
  if (
    !storyboard.audio.enabled ||
    voiceManifest.jobId !== storyboard.jobId ||
    voiceManifest.fingerprint !== storyboard.audio.fingerprint ||
    voiceManifest.durationMs !== storyboard.audio.durationMs ||
    voiceManifest.sceneTimings.length !== normalizedParts.length ||
    voiceManifest.sceneTimings.some((timing, index) =>
      timing.sceneId !== normalizedParts[index]!.sceneId || timing.text !== normalizedParts[index]!.text)
  ) throw new Error("voice manifest 与最终 Storyboard 不一致");
  if (videoTrack.codec !== "avc" || videoTrack.width !== 1080 || videoTrack.height !== 1920 || Math.abs(videoTrack.fps - 30) > 0.05) {
    throw new Error(`final.mp4 视频规格不正确：${JSON.stringify(videoTrack)}`);
  }
  if (audioTrack.codec !== "aac") throw new Error(`final.mp4 音频必须是 AAC，实际为 ${String(audioTrack.codec)}`);
  const toleranceMs = 1000 / 30 + 80;
  if (
    Math.abs(voice.durationMs - storyboard.format.durationMs) > 2 ||
    Math.abs(video.durationMs - voice.durationMs) > toleranceMs ||
    Math.abs(audioTrack.durationMs - voice.durationMs) > toleranceMs
  ) throw new Error("视频总时长必须与真实 voice 时长基本一致");
  const captionText = subtitles.captions.map((caption) => caption.text).join("");
  const narratedText = voiceManifest.sceneTimings.map((timing) => timing.text).join("");
  if (captionText !== narratedText || subtitles.captions.length !== storyboard.captions.length) {
    throw new Error("字幕未完整覆盖自然化中文口播");
  }
  if (storyboard.scenes.some((scene) => scene.onScreenText.length < 1 || scene.visualIntent.length < 1)) {
    throw new Error("存在没有明确视觉重点的场景");
  }
  const longestStaticVisualMs = longestStaticVisualDurationMs(storyboard.scenes);
  if (longestStaticVisualMs > 10_000) {
    throw new Error(`存在超过 10 秒没有场景级视觉变化的区间：${longestStaticVisualMs}ms`);
  }
  if (voiceStats.size < 10_000 || videoStats.size < 100_000) throw new Error("最终媒体文件异常小");
  await assertNoBlankRun(resolve(directory, "final.mp4"));
  return {storyboard, voice, video, voiceStats, videoStats, longestStaticVisualMs};
};
