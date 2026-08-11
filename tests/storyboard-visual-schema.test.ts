import {describe, expect, it} from "vitest";
import sampleStoryboardJson from "../templates/knowledge/sample-storyboard.json";
import {migrateStoryboardV1ToV1_1} from "../src/storyboard/migrations/v1-to-v1-1";
import {parseStoryboard} from "../src/storyboard/schema";
import {
  parseVisualStoryboard,
  VisualStoryboardSchema,
} from "../src/storyboard/visual-schema";

const bookDeepReadingStoryboard = (durationMs: number) => {
  const storyboard = structuredClone(parseVisualStoryboard(sampleStoryboardJson));
  storyboard.profile = "book-deep-reading";
  const scaleTimestamp = (timestampMs: number): number =>
    timestampMs <= 3_000
      ? timestampMs
      : 3_000 + (timestampMs - 3_000) * 11;

  storyboard.format.durationMs = durationMs;
  storyboard.scenes.forEach((scene) => {
    scene.startMs = scaleTimestamp(scene.startMs);
    scene.endMs = scaleTimestamp(scene.endMs);
  });
  storyboard.captions.forEach((caption) => {
    caption.startMs = scaleTimestamp(caption.startMs);
    caption.endMs = scaleTimestamp(caption.endMs);
  });

  return storyboard;
};

const legacyStoryboard = (profile?: "knowledge-short" | "book-deep-reading") =>
  parseStoryboard({
    schemaVersion: "1.0",
    jobId: "legacy-demo",
    format: {width: 1080, height: 1920, fps: 30, durationMs: 10_000},
    template: "knowledge",
    ...(profile ? {profile} : {}),
    scenes: [
      {
        id: "scene-hook",
        startMs: 0,
        endMs: 3000,
        purpose: "hook",
        voiceText: "旧版钩子",
        onScreenText: ["旧版钩子", "旧版说明"],
        visualIntent: "迁移钩子",
        assetRefs: [],
        emphasis: ["旧版钩子"],
        contentFlags: [],
        transition: "fade",
        transitionDurationMs: 300,
        presentation: {variant: "hook", accentColor: "#ffffff"},
      },
      {
        id: "scene-point",
        startMs: 3000,
        endMs: 7000,
        purpose: "knowledge",
        voiceText: "旧版知识点",
        onScreenText: ["旧版知识点", "旧版行动"],
        visualIntent: "迁移知识点",
        assetRefs: [],
        emphasis: ["旧版知识点"],
        contentFlags: [],
        transition: "fade",
        transitionDurationMs: 300,
        presentation: {
          variant: "knowledge-point",
          accentColor: "#ffffff",
          pointNumber: 1,
        },
      },
      {
        id: "scene-summary",
        startMs: 7000,
        endMs: 10_000,
        purpose: "summary",
        voiceText: "旧版总结",
        onScreenText: ["步骤一", "步骤二", "步骤三"],
        visualIntent: "迁移总结",
        assetRefs: [],
        emphasis: ["旧版总结"],
        contentFlags: [],
        transition: "cut",
        transitionDurationMs: 0,
        presentation: {variant: "summary-card", accentColor: "#ffffff"},
      },
    ],
    captions: [
      {text: "旧版字幕", startMs: 0, endMs: 10_000, timestampMs: null, confidence: null},
    ],
  });

describe("Storyboard V1.1 visual contract", () => {
  it("defaults a profile-less sample to knowledge-short", () => {
    expect(parseVisualStoryboard(sampleStoryboardJson).profile).toBe("knowledge-short");
  });

  it("accepts a 300000ms Book Deep Reading storyboard", () => {
    expect(parseVisualStoryboard(bookDeepReadingStoryboard(300_000)).format.durationMs).toBe(300_000);
  });

  it("rejects Book Deep Reading storyboards longer than 360000ms", () => {
    const storyboard = bookDeepReadingStoryboard(300_000);
    storyboard.format.durationMs = 360_001;
    storyboard.scenes.at(-1)!.endMs = 360_001;
    storyboard.captions.at(-1)!.endMs = 360_001;

    expect(VisualStoryboardSchema.safeParse(storyboard).success).toBe(false);
  });

  it("keeps the Primary Hook within 3000ms", () => {
    const storyboard = bookDeepReadingStoryboard(300_000);
    storyboard.scenes[0]!.endMs = 3_001;
    storyboard.scenes[1]!.startMs = 3_001;

    expect(VisualStoryboardSchema.safeParse(storyboard).success).toBe(false);
  });

  it("migrates the V1 sample into a valid visual storyboard", () => {
    const migrated = migrateStoryboardV1ToV1_1(legacyStoryboard());
    const storyboard = parseVisualStoryboard(migrated);

    expect(storyboard.schemaVersion).toBe("1.1");
    expect(storyboard.branding).toEqual({enabled: false});
    expect(storyboard.scenes[0]).toMatchObject({
      purpose: "hook",
      visualType: "hook",
      visualData: {tone: "ink"},
    });
    expect(storyboard.scenes.at(-1)).toMatchObject({
      purpose: "summary",
      visualType: "summary",
    });
  });

  it("preserves the selected profile when migrating a V1 storyboard", () => {
    expect(migrateStoryboardV1ToV1_1(legacyStoryboard("book-deep-reading")).profile)
      .toBe("book-deep-reading");
  });

  it("rejects diagram edges that reference unknown nodes", () => {
    const migrated = migrateStoryboardV1ToV1_1(legacyStoryboard());
    const diagram = migrated.scenes.find(
      (scene) => scene.visualType === "diagram",
    );
    if (!diagram || diagram.visualType !== "diagram") {
      throw new Error("migration must produce a diagram scene");
    }
    diagram.visualData.edges[0]!.to = "missing-node";

    const result = VisualStoryboardSchema.safeParse(migrated);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
        `scenes.${migrated.scenes.indexOf(diagram)}.visualData.edges.0.to`,
      );
    }
  });

  it("requires enabled branding to include a label", () => {
    const migrated = migrateStoryboardV1ToV1_1(legacyStoryboard());
    migrated.branding = {enabled: true, label: "", position: "top-left"};

    expect(VisualStoryboardSchema.safeParse(migrated).success).toBe(false);
  });

  it("upgrades a legacy V1.1 visual storyboard missing narration fields", () => {
    const current = structuredClone(sampleStoryboardJson) as Record<string, unknown> & {
      scenes: Array<Record<string, unknown>>;
    };
    delete current.narration;
    current.scenes.forEach((scene) => delete scene.onScreenText);

    const parsed = parseVisualStoryboard(current);

    expect(parsed.narration.preset).toBe("natural");
    expect(parsed.scenes.every((scene) => scene.onScreenText.length > 0)).toBe(true);
  });

  it("rejects onScreenText that is not represented by visualData", () => {
    const current = structuredClone(sampleStoryboardJson);
    current.scenes[0]!.onScreenText = ["画面里不存在的文案"];

    expect(VisualStoryboardSchema.safeParse(current).success).toBe(false);
  });
});
