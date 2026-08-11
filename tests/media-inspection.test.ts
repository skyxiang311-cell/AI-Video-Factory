import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, describe, expect, it} from "vitest";
import {inspectMediaFile} from "../src/shared/media-inspection";

let temporaryDirectory: string | undefined;

const run = (executable: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {stdio: "ignore"});
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${String(code)}`)),
    );
  });

afterAll(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, {recursive: true, force: true});
  }
});

describe("inspectMediaFile", () => {
  it("reads an actual MP3 duration and audio track", async () => {
    if (!ffmpegPath) {
      throw new Error("ffmpeg-static is unavailable");
    }
    temporaryDirectory = await mkdtemp(join(tmpdir(), "voice-media-test-"));
    const audioPath = join(temporaryDirectory, "voice.mp3");
    await run(ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1.2",
      "-c:a",
      "libmp3lame",
      audioPath,
    ]);

    const media = await inspectMediaFile(audioPath);

    expect(media.canRead).toBe(true);
    expect(media.durationMs).toBeGreaterThanOrEqual(1150);
    expect(media.durationMs).toBeLessThanOrEqual(1300);
    expect(media.audioTracks).toHaveLength(1);
    expect(media.videoTracks).toHaveLength(0);
  });
});
