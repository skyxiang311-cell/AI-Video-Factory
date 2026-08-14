import {describe, expect, it} from "vitest";
import {buildComicDialogueStoryboard} from "../src/research/book/book-dialogue-storyboard";
import {buildDialogueVoiceTimeline} from "../src/research/book/book-dialogue-timing";
import {makeDialogueDraft} from "./fixtures/book-dialogue";
import {resolveDialogueVisualState} from "../src/research/book/book-dialogue-visual-timing";

describe("true dialogue comic storyboard", () => {
  it("creates 40-60 speaker-led shots with at least 70% character scenes", () => {
    const draft = makeDialogueDraft();
    const timeline = buildDialogueVoiceTimeline({draft, leadInMs: 60, tailOutMs: 300, segments: draft.turns.map((turn,index) => ({turnId: turn.id, durationMs:index===2?12000:5300, boundaries: []}))});
    const storyboard = buildComicDialogueStoryboard({jobId: "sample-dialogue", timeline, referenceImage: "dialogue-assets/character-reference.png", audioSha256: "a".repeat(64), dialogueScriptSha256: "b".repeat(64)});
    expect(storyboard.shots.length).toBeGreaterThanOrEqual(40);
    expect(storyboard.shots.length).toBeLessThanOrEqual(60);
    expect(storyboard.characterScenePercentage).toBeGreaterThanOrEqual(70);
    expect(storyboard.infoCardPercentage).toBeLessThanOrEqual(30);
    expect(storyboard.shots).toHaveLength(timeline.turns.length);
    expect(storyboard.shots.every((shot) => {const points=[...shot.visualBeats.map((beat)=>beat.atMs),shot.endMs-shot.startMs];return points.slice(1).every((point,index)=>point-points[index]!<=6000);})).toBe(true);
    expect(storyboard.shots.some((shot) => shot.framing === "xiaoyuan-closeup")).toBe(true);
    expect(storyboard.shots.some((shot) => shot.framing === "douzai-reaction")).toBe(true);
    expect(storyboard.shots.flatMap((shot) => shot.claimIds)).toContain("claim-012-middle-class-social-function");
    expect(storyboard.audio).toMatchObject({src: "dialogue-voice.mp3", multiVoice: true});
    const longShot=storyboard.shots[2]!;const before=resolveDialogueVisualState({...longShot,localMs:500});const after=resolveDialogueVisualState({...longShot,localMs:4500});
    expect(after.activeBeatIndex).toBeGreaterThan(before.activeBeatIndex);expect(after.characterPose).not.toBe(before.characterPose);expect(after.bubbleScale).not.toBe(before.bubbleScale);
  });
});
