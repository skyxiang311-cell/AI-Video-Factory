import {describe, expect, it} from "vitest";
import {createDemoArtifacts} from "../src/shared/demo-artifacts";
import {sampleStoryboard} from "../src/storyboard/sample";

describe("createDemoArtifacts", () => {
  it("derives deterministic local-demo artifacts from one storyboard", () => {
    const first = createDemoArtifacts(sampleStoryboard);
    const second = createDemoArtifacts(sampleStoryboard);

    expect(second).toEqual(first);
    expect(
      Object.values(first).every(
        (artifact) => artifact.jobId === sampleStoryboard.jobId,
      ),
    ).toBe(true);
    expect(
      Object.values(first).every(
        (artifact) => artifact.mode === "voice-driven-local-demo",
      ),
    ).toBe(true);
  });

  it("keeps script and subtitle artifacts aligned with the storyboard", () => {
    const artifacts = createDemoArtifacts(sampleStoryboard);

    expect(artifacts.script.segments).toEqual(
      sampleStoryboard.scenes.map((scene) => ({
        sceneId: scene.id,
        startMs: scene.startMs,
        endMs: scene.endMs,
        speechStartMs: scene.speechStartMs ?? scene.startMs,
        speechEndMs: scene.speechEndMs ?? scene.endMs,
        text: scene.voiceText,
      })),
    );
    expect(artifacts.subtitles.captions).toEqual(sampleStoryboard.captions);
  });

  it("declares the preview-only audio state truthfully", () => {
    const {assets} = createDemoArtifacts(sampleStoryboard);

    expect({assets: assets.assets, voice: assets.voice}).toEqual({
      assets: [],
      voice: {
        kind: "preview-without-audio",
        usedInRender: false,
        reason: "仅用于未生成配音前的 Studio 视觉预览",
      },
    });
  });
});
