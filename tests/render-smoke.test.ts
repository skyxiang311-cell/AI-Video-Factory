import {bundle} from "@remotion/bundler";
import {renderMedia, renderStill, selectComposition} from "@remotion/renderer";
import {mkdtemp, rm, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {afterAll, describe, expect, it} from "vitest";
import {sampleStoryboard} from "../src/storyboard/sample";
import {inspectMediaFile} from "../src/shared/media-inspection";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";
import ffmpegPath from "ffmpeg-static";
import {spawn} from "node:child_process";

let temporaryDirectory: string | undefined;

afterAll(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, {recursive: true, force: true});
  }
});

describe("KnowledgeDemo render", () => {
  it("bundles and renders a nonempty H.264 MP4", async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), "ai-video-factory-render-"),
    );
    const outputLocation = join(temporaryDirectory, "smoke.mp4");
    if (!ffmpegPath) {
      throw new Error("ffmpeg-static is unavailable");
    }
    const ffmpegBinary = ffmpegPath;
    const audioPath = join(temporaryDirectory, "smoke.mp3");
    await new Promise<void>((resolveProcess, reject) => {
      const child = spawn(ffmpegBinary, [
        "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.2",
        "-c:a", "libmp3lame", audioPath,
      ], {stdio: ["ignore", "ignore", "ignore"]});
      child.once("error", reject);
      child.once("exit", (code: number | null) => code === 0 ? resolveProcess() : reject(new Error("fixture audio failed")));
    });
    const storyboard = parseVisualStoryboard({
      ...sampleStoryboard,
      audio: {
        enabled: true,
        src: "smoke.mp3",
        durationMs: sampleStoryboard.format.durationMs,
        provider: "test-fixture",
        voice: "fixture",
        rate: "+0%",
        fingerprint: "fixture-fingerprint",
      },
    });
    const serveUrl = await bundle({
      entryPoint: resolve("apps/studio/src/index.ts"),
      publicDir: temporaryDirectory,
    });
    const composition = await selectComposition({
      serveUrl,
      id: "KnowledgeDemo",
      inputProps: storyboard,
    });

    expect(composition).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 900,
    });

    await renderMedia({
      codec: "h264",
      pixelFormat: "yuv420p",
      composition,
      serveUrl,
      inputProps: storyboard,
      outputLocation,
      frameRange: [0, 29],
      scale: 0.25,
    });

    expect((await stat(outputLocation)).size).toBeGreaterThan(1024);
    expect((await inspectMediaFile(outputLocation)).audioTracks).toHaveLength(1);

    for (const frame of [45, 150, 300, 450, 615, 810]) {
      const still = join(temporaryDirectory, `scene-${frame}.png`);
      await renderStill({
        composition,
        serveUrl,
        inputProps: storyboard,
        output: still,
        frame,
        scale: 0.25,
      });
      expect((await stat(still)).size).toBeGreaterThan(1024);
    }
  });
});
