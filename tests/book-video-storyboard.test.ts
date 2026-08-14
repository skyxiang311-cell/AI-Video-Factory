import {describe, expect, it} from "vitest";
import {BookDeepScriptSchema} from "../src/research/book/book-script-schema";
import {buildBookVideoStoryboard} from "../src/research/book/book-video-storyboard";

const timeline = [
  ["primary_hook", 0, 3],
  ["hook_extension", 3, 8],
  ["audience_relevance", 8, 30],
  ["author_core_judgment", 30, 75],
  ["strongest_evidence", 75, 145],
  ["second_layer_mechanism", 145, 200],
  ["critical_turn", 200, 245],
  ["system_judgment", 245, 285],
  ["memorable_ending", 285, 300],
] as const;

const sourceRef = {
  type: "book" as const,
  chapterId: "chapter-001",
  page: 42,
  blockId: "p42-b001",
};

const script = BookDeepScriptSchema.parse({
  title: "中产阶层为何与社会稳定有关？",
  selectedAngleId: "angle-middle-class",
  centralQuestion: "中产阶层为何与社会稳定有关？",
  targetDurationSec: 300,
  durationSec: 300,
  segments: timeline.map(([purpose, startSec, endSec], index) => ({
    purpose,
    startSec,
    endSec,
    text: index === 4
      ? "书中记录，家庭年人均可支配收入在2万至6.7万元之间。"
      : `这是第${index + 1}段用于验证确定性画面的中文口播，不是字幕墙。`,
    voiceText: index === 4
      ? "书中记录，家庭年人均可支配收入在2万至6.7万元之间。"
      : `这是第${index + 1}段用于验证确定性画面的中文口播，不是字幕墙。`,
    claimIds: index > 1 && index < 7 ? ["claim-middle-class"] : [],
    sourceRefs: index > 1 && index < 7 ? [sourceRef] : [],
    visibleSourceRequired: index === 4,
  })),
  quality: {
    hook: 10,
    centralQuestion: 10,
    narrativeCoherence: 15,
    evidence: 15,
    depth: 15,
    criticalThinking: 10,
    practicalValue: 10,
    spokenChinese: 10,
    ending: 5,
    overallScore: 100,
    blockingIssues: [],
    status: "PASS",
  },
});

describe("Book Deep Reading video storyboard", () => {
  it("deterministically maps the 300-second script to animated knowledge scenes", () => {
    const storyboard = buildBookVideoStoryboard("sample-book", script);

    expect(storyboard.profile).toBe("book-deep-reading");
    expect(storyboard.format).toEqual({width: 1080, height: 1920, fps: 30, durationMs: 300_000});
    expect(storyboard.scenes.length).toBeGreaterThan(9);
    expect(storyboard.scenes[0]).toMatchObject({visualType: "hook", purpose: "hook", startMs: 0, endMs: 3000});
    expect(new Set(storyboard.scenes.map((scene) => scene.visualType))).toEqual(
      new Set(["hook", "comparison", "diagram", "stat", "summary"]),
    );
    expect(storyboard.scenes.every((scene) => scene.onScreenText.length > 0 && scene.visualIntent.length > 0)).toBe(true);
    expect(storyboard.scenes.some((scene) => (scene.sourceRefs?.length ?? 0) > 0)).toBe(true);
    expect(storyboard.scenes.find((scene) => scene.sourceNote)?.sourceNote).toBe("原书第42页");
    expect(storyboard.narration.preset).toBe("natural");
    expect(storyboard.captions.length).toBeGreaterThan(9);
  });

  it("keeps all spoken script content while shortening the primary hook utterance", () => {
    const storyboard = buildBookVideoStoryboard("sample-book", script);
    const spoken = storyboard.scenes.map((scene) => scene.voiceText).join("");
    const source = script.segments.map((segment) => segment.voiceText).join("");

    expect(spoken).toBe(source);
    expect(Array.from(storyboard.scenes[0]!.voiceText).length).toBeLessThanOrEqual(10);
    expect(storyboard.scenes.slice(1).map((scene) => scene.voiceText).join("")).toContain(script.segments[1]!.voiceText);
  });

  it("derives visual copy from the input instead of baking in the current book angle", () => {
    const generic = BookDeepScriptSchema.parse({
      ...script,
      title: "学习反馈如何改变下一次行动？",
      centralQuestion: "学习反馈如何改变下一次行动？",
      segments: script.segments.map((segment, index) => ({
        ...segment,
        text: `学习反馈样例第${index + 1}段，讨论行动、复盘与边界。`,
        voiceText: `学习反馈样例第${index + 1}段，讨论行动、复盘与边界。`,
        sourceRefs: [],
        visibleSourceRequired: false,
      })),
    });

    const serialized = JSON.stringify(buildBookVideoStoryboard("sample-book", generic));
    expect(serialized).not.toContain("中产阶层");
    expect(serialized).not.toContain("2万元");
    expect(serialized).not.toContain("中国样本");
    expect(serialized).toContain("学习反馈");
  });

  it("supports the full 270-330 second Book Deep Reading profile", () => {
    for (const durationSec of [270, 330]) {
      const adjusted = BookDeepScriptSchema.parse({
        ...script,
        durationSec,
        segments: script.segments.map((segment) => ({
          ...segment,
          startSec: Math.round(segment.startSec * durationSec / 300),
          endSec: Math.round(segment.endSec * durationSec / 300),
        })),
      });
      const storyboard = buildBookVideoStoryboard("sample-book", adjusted);
      expect(storyboard.format.durationMs).toBe(durationSec * 1000);
      expect(storyboard.scenes.at(-1)!.endMs).toBe(durationSec * 1000);
      expect(storyboard.scenes[0]!.endMs).toBeLessThanOrEqual(3000);
    }
  });

  it("compresses long multi-page source notes while preserving every sourceRef", () => {
    const pages = Array.from({length: 16}, (_, index) => ({
      type: "book" as const,
      chapterId: "chapter-001",
      page: index + 1,
      blockId: `p${index + 1}-b001`,
    }));
    const manyRefs = BookDeepScriptSchema.parse({
      ...script,
      segments: script.segments.map((segment, index) => index === 4
        ? {...segment, sourceRefs: pages, visibleSourceRequired: true}
        : segment),
    });

    const evidenceScene = buildBookVideoStoryboard("sample-book", manyRefs).scenes.find((scene) => scene.sourceRefs?.length === 16)!;
    expect(evidenceScene.sourceRefs).toHaveLength(16);
    expect(evidenceScene.sourceNote).toBe("原书第1—16页（共16页）");
  });
});
