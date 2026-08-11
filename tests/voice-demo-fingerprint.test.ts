import {describe, expect, it} from "vitest";
import sampleStoryboardJson from "../templates/knowledge/sample-storyboard.json";
import {buildDemoVoiceFingerprint} from "../scripts/voice-demo";
import {parseVisualStoryboard} from "../src/storyboard/visual-schema";

describe("buildDemoVoiceFingerprint", () => {
  it("invalidates cached storyboard when visual or narration source changes", () => {
    const first = parseVisualStoryboard(sampleStoryboardJson);
    const changed = parseVisualStoryboard({
      ...sampleStoryboardJson,
      scenes: sampleStoryboardJson.scenes.map((scene, index) => index === 0
        ? {...scene, visualIntent: `${scene.visualIntent}（更新）`}
        : scene),
    });

    expect(buildDemoVoiceFingerprint(changed)).not.toBe(buildDemoVoiceFingerprint(first));
  });
});
