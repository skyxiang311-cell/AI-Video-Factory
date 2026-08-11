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
        (artifact) => artifact.mode === "fixed-local-demo",
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
        text: scene.voiceText,
      })),
    );
    expect(artifacts.subtitles.captions).toEqual(sampleStoryboard.captions);
  });

  it("declares the silent voice placeholder truthfully", () => {
    const {assets} = createDemoArtifacts(sampleStoryboard);

    expect({assets: assets.assets, voice: assets.voice}).toEqual({
      assets: [],
      voice: {
        kind: "silent-demo-placeholder",
        usedInRender: false,
        reason: "真实中文配音不在第二阶段范围内",
      },
    });
  });
});
