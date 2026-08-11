import {describe, expect, it} from "vitest";
import sampleJson from "../templates/knowledge/sample-storyboard.json";
import {migrateStoryboardV1ToV1_1} from "../src/storyboard/migrations/v1-to-v1-1";
import {parseStoryboard} from "../src/storyboard/schema";
import {
  parseVisualStoryboard,
  VisualStoryboardSchema,
} from "../src/storyboard/visual-schema";

describe("Storyboard V1.1 visual contract", () => {
  it("migrates the V1 sample into a valid visual storyboard", () => {
    const migrated = migrateStoryboardV1ToV1_1(parseStoryboard(sampleJson));
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

  it("rejects diagram edges that reference unknown nodes", () => {
    const migrated = migrateStoryboardV1ToV1_1(parseStoryboard(sampleJson));
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
    const migrated = migrateStoryboardV1ToV1_1(parseStoryboard(sampleJson));
    migrated.branding = {enabled: true, label: "", position: "top-left"};

    expect(VisualStoryboardSchema.safeParse(migrated).success).toBe(false);
  });
});
