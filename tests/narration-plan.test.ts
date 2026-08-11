import {describe, expect, it} from "vitest";
import sampleStoryboardJson from "../templates/knowledge/sample-storyboard.json";
import {buildNarrationPlan} from "../src/narration/build-narration-plan";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";

describe("buildNarrationPlan", () => {
  it("groups adjacent scenes into fewer semantic speech blocks", () => {
    const storyboard = parseVisualStoryboard(sampleStoryboardJson);
    const plan = buildNarrationPlan(storyboard);

    expect(plan.preset).toBe("natural");
    expect(plan.blocks.length).toBeLessThan(storyboard.scenes.length);
    expect(plan.blocks.flatMap((block) => block.parts.map((part) => part.sceneId)))
      .toEqual(storyboard.scenes.map((scene) => scene.id));
    expect(plan.blocks.some((block) => block.parts.length > 1)).toBe(true);
    expect(plan.blocks.every((block) => block.text === block.parts.map((part) => part.text).join("")))
      .toBe(true);
  });

  it("keeps spoken text separate from compact on-screen text", () => {
    const storyboard = parseVisualStoryboard(sampleStoryboardJson);

    expect(storyboard.scenes.every((scene) => scene.onScreenText.length > 0)).toBe(true);
    expect(storyboard.scenes.every((scene) => scene.voiceText !== scene.onScreenText.join("")))
      .toBe(true);
  });
});
