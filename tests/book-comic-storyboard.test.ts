import {describe, expect, it} from "vitest";
import {BookDeepScriptSchema} from "../src/research/book/book-script-schema";
import {buildBookComicStoryboard, buildDefaultComicCharacterPack} from "../src/research/book/book-comic-storyboard";
import {buildBookVideoStoryboard} from "../src/research/book/book-video-storyboard";
import {resolveComicCharacterPoses, resolveComicVisualState} from "../src/research/book/book-comic-timing";

const purposes = [
  "primary_hook", "hook_extension", "audience_relevance", "author_core_judgment",
  "strongest_evidence", "second_layer_mechanism", "critical_turn", "system_judgment",
  "memorable_ending",
] as const;
const endpoints = [[0,3],[3,8],[8,30],[30,75],[75,145],[145,200],[200,245],[245,285],[285,300]] as const;
const sourceRef = {type: "book" as const, chapterId: "chapter-012", page: 264, blockId: "p264-b1"};

const script = BookDeepScriptSchema.parse({
  title: "漫画测试", selectedAngleId: "angle-comic", centralQuestion: "一个概念为什么不能只看标签？",
  targetDurationSec: 300, durationSec: 300,
  segments: purposes.map((purpose, index) => {
    const voiceText = `第${index + 1}段保留作者观点、证据和适用边界，${"用原文解释概念并检查证据范围，".repeat(5)}`;
    return {
      purpose, startSec: endpoints[index]![0], endSec: endpoints[index]![1], text: voiceText, voiceText,
      claimIds: index >= 2 && index <= 7 ? ["claim-comic"] : [],
      sourceRefs: index >= 2 && index <= 7 ? [sourceRef] : [], visibleSourceRequired: index === 4,
    };
  }),
  quality: {hook:10,centralQuestion:10,narrativeCoherence:15,evidence:15,depth:15,criticalThinking:10,practicalValue:10,spokenChinese:10,ending:5,overallScore:100,blockingIssues:[],status:"PASS"},
});

describe("Book comic explainer storyboard", () => {
  it("defines stable Xiaoyuan and Douzai packs with ten expressive states each", () => {
    const pack = buildDefaultComicCharacterPack("comic-scenes/character-reference.png");
    expect(pack.characters.xiaoyuan.states).toHaveLength(10);
    expect(pack.characters.douzai.states).toHaveLength(10);
    expect(new Set(pack.characters.xiaoyuan.states.map((state) => state.name))).toContain("explain");
    expect(new Set(pack.characters.douzai.states.map((state) => state.name))).toContain("question");
    expect(pack.components).toEqual(expect.arrayContaining(["speech-bubble", "thought-bubble", "emphasis-lines", "arrow", "number-tag", "keyword-sticker", "icon-slot", "mini-chart"]));
  });

  it("rebuilds a five-minute timeline into 30-45 traceable comic shots", () => {
    const source = buildBookVideoStoryboard("sample-comic", script);
    const comic = buildBookComicStoryboard({
      jobId: "sample-comic", source, lockedScriptSha256: "a".repeat(64),
      sourceStoryboardSha256: "b".repeat(64), referenceImageSha256: "c".repeat(64), captionsSha256: "d".repeat(64),
      audio: {fingerprint: "e".repeat(64), durationMs: source.format.durationMs, sha256: "f".repeat(64)},
      characterPack: buildDefaultComicCharacterPack("comic-scenes/character-reference.png"),
    });
    expect(comic.shots.length).toBeGreaterThanOrEqual(30);
    expect(comic.shots.length).toBeLessThanOrEqual(45);
    expect(comic.shots.every((shot) => shot.endMs - shot.startMs >= 3000 && shot.endMs - shot.startMs <= 8000)).toBe(true);
    expect(comic.shots.every((shot) => shot.visualBeats.length >= 2 && shot.visualBeats.length <= 4)).toBe(true);
    expect(Math.max(...comic.shots.flatMap((shot) => shot.visualBeats.slice(1).map((beat, index) => beat.atMs - shot.visualBeats[index]!.atMs)))).toBeLessThanOrEqual(6000);
    expect(comic.shots.flatMap((shot) => shot.turns).some((turn) => turn.speaker === "xiaoyuan")).toBe(true);
    expect(comic.shots.flatMap((shot) => shot.turns).some((turn) => turn.speaker === "douzai")).toBe(true);
    expect(comic.shots[0]!.turns.map((turn) => turn.speaker)).toEqual(expect.arrayContaining(["douzai", "xiaoyuan"]));
    expect(comic.shots.some((shot) => shot.claimIds.includes("claim-comic") && shot.sourceRefs.length > 0)).toBe(true);
    expect(new Set(comic.shots.map((shot) => shot.background)).size).toBeGreaterThanOrEqual(4);
    expect(comic.audio).toMatchObject({reused: true, src: "voice.mp3"});
    const sourceById = new Map(source.scenes.map((scene) => [scene.id, scene]));
    expect(comic.shots.flatMap((shot) => shot.turns).every((turn) => {
      const sourceScene = sourceById.get(turn.sourceSceneId);
      return sourceScene?.startMs === turn.startMs && sourceScene.endMs === turn.endMs && sourceScene.voiceText === turn.text;
    })).toBe(true);
  });

  it("uses declared source timings and visual beat timestamps", () => {
    const state = resolveComicVisualState({
      absoluteMs: 4700, shotStartMs: 1000,
      turns: [
        {startMs: 1000, endMs: 4500},
        {startMs: 4500, endMs: 8000},
      ],
      visualBeats: [
        {atMs: 0, kind: "character-enter"},
        {atMs: 4100, kind: "bubble-swap"},
        {atMs: 6200, kind: "keyword-pop"},
      ],
    });
    expect(state.activeTurnIndex).toBe(1);
    expect(state.revealedBeatKinds).toEqual(["character-enter"]);
    const poses = resolveComicCharacterPoses([
      {speaker: "xiaoyuan", pose: "emphasize"},
      {speaker: "douzai", pose: "question"},
      {speaker: "xiaoyuan", pose: "thinking"},
    ], 2);
    expect(poses).toEqual({xiaoyuan: "thinking", douzai: "question"});
  });
});
