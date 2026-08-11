import {describe, expect, it} from "vitest";
import {ZodError} from "zod";
import sampleJson from "../templates/knowledge/sample-storyboard.json";
import {parseStoryboard} from "../src/storyboard/schema";

const cloneSample = () => structuredClone(parseStoryboard(sampleJson));

const expectInvalidPath = (input: unknown, expectedPath: string): void => {
  try {
    parseStoryboard(input);
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
    const paths = (error as ZodError).issues.map((issue) => issue.path.join("."));
    expect(paths).toContain(expectedPath);
    return;
  }

  throw new Error(`Expected validation to fail at ${expectedPath}`);
};

describe("StoryboardSchema", () => {
  it("accepts the fixed 24-second Knowledge sample", () => {
    const storyboard = parseStoryboard(sampleJson);

    expect(storyboard.format).toEqual({
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 24_000,
    });
    expect(storyboard.scenes[0]).toMatchObject({
      startMs: 0,
      endMs: 3000,
      purpose: "hook",
    });
    expect(storyboard.scenes.filter((scene) => scene.purpose === "knowledge")).toHaveLength(3);
    expect(storyboard.scenes.at(-1)?.purpose).toBe("summary");
    expect(storyboard.captions.length).toBeGreaterThanOrEqual(8);
  });

  it("rejects overlapping scenes with the next start path", () => {
    const input = cloneSample();
    input.scenes[1]!.startMs = 2999;
    expectInvalidPath(input, "scenes.1.startMs");
  });

  it("rejects duplicate scene ids", () => {
    const input = cloneSample();
    input.scenes[1]!.id = input.scenes[0]!.id;
    expectInvalidPath(input, "scenes.1.id");
  });

  it("rejects a hook longer than three seconds", () => {
    const input = cloneSample();
    input.scenes[0]!.endMs = 3001;
    input.scenes[1]!.startMs = 3001;
    expectInvalidPath(input, "scenes.0.endMs");
  });

  it("rejects captions beyond the composition duration", () => {
    const input = cloneSample();
    input.captions.at(-1)!.endMs = 24_001;
    expectInvalidPath(input, `captions.${input.captions.length - 1}.endMs`);
  });

  it("rejects a cut transition with a nonzero duration", () => {
    const input = cloneSample();
    input.scenes.at(-1)!.transitionDurationMs = 300;
    expectInvalidPath(input, `scenes.${input.scenes.length - 1}.transitionDurationMs`);
  });

  it("requires a currency unit for foreign-price scenes", () => {
    const input = cloneSample();
    input.scenes[1]!.contentFlags = ["foreign-price"];
    expectInvalidPath(input, "scenes.1.contentFlags");
  });

  it("accepts explicit currency units for foreign-price scenes", () => {
    const input = cloneSample();
    input.scenes[1]!.contentFlags = ["foreign-price"];
    input.scenes[1]!.voiceText += "，示例价格为 100 日元";
    expect(() => parseStoryboard(input)).not.toThrow();
  });

  it("rejects emphasis text absent from voice and on-screen copy", () => {
    const input = cloneSample();
    input.scenes[2]!.emphasis = ["不存在的重点"];
    expectInvalidPath(input, "scenes.2.emphasis.0");
  });
});
