import {bundle} from "@remotion/bundler";
import {renderMedia, renderStill, selectComposition} from "@remotion/renderer";
import {mkdtemp, rm, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {afterAll, describe, expect, it} from "vitest";
import {sampleStoryboard} from "../src/storyboard/sample";

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
    const knowledgeSceneStill = join(
      temporaryDirectory,
      "knowledge-scene.png",
    );
    const serveUrl = await bundle({
      entryPoint: resolve("apps/studio/src/index.ts"),
    });
    const composition = await selectComposition({
      serveUrl,
      id: "KnowledgeDemo",
      inputProps: sampleStoryboard,
    });

    expect(composition).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 720,
    });

    await renderMedia({
      codec: "h264",
      pixelFormat: "yuv420p",
      composition,
      serveUrl,
      inputProps: sampleStoryboard,
      outputLocation,
      frameRange: [0, 29],
      scale: 0.25,
    });

    expect((await stat(outputLocation)).size).toBeGreaterThan(1024);

    await renderStill({
      composition,
      serveUrl,
      inputProps: sampleStoryboard,
      output: knowledgeSceneStill,
      frame: 195,
      scale: 0.25,
    });
    expect((await stat(knowledgeSceneStill)).size).toBeGreaterThan(1024);
  });
});
