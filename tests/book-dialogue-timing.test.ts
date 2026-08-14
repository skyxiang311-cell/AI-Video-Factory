import {describe, expect, it} from "vitest";
import {buildDialogueVoiceTimeline} from "../src/research/book/book-dialogue-timing";
import {makeDialogueDraft} from "./fixtures/book-dialogue";
import {segmentChineseCaptionText} from "../src/subtitles/voice-caption-alignment";

describe("two-character dialogue timing", () => {
  it("uses synthesized turn durations and keeps the real track in the five-minute range", () => {
    const draft = makeDialogueDraft();
    const timeline = buildDialogueVoiceTimeline({
      draft,
      leadInMs: 60,
      tailOutMs: 300,
      segments: draft.turns.map((turn) => ({turnId: turn.id, durationMs: 5300, boundaries: []})),
    });
    expect(timeline.durationMs).toBeGreaterThanOrEqual(270000);
    expect(timeline.durationMs).toBeLessThanOrEqual(330000);
    expect(timeline.turns[0]!.speechStartMs).toBe(60);
    expect(timeline.turns.at(-1)!.endMs).toBe(timeline.durationMs);
    expect(timeline.maxXiaoyuanMonologueMs).toBeLessThanOrEqual(15000);
    expect(timeline.captions.length).toBeGreaterThan(draft.turns.length);
    expect(new Set(timeline.captions.map((caption) => caption.speaker))).toEqual(new Set(["xiaoyuan", "douzai", "narrator"]));
  });

  it("normalizes per-segment MP3 padding to the final assembled audio duration",()=>{
    const draft=makeDialogueDraft();const segments=draft.turns.map((turn)=>({turnId:turn.id,durationMs:5300,boundaries:[{text:turn.voiceText,offsetMs:0,durationMs:5300}]}));
    const planned=buildDialogueVoiceTimeline({draft,leadInMs:60,tailOutMs:300,segments});const assembledDurationMs=planned.durationMs-3000;
    const timeline=buildDialogueVoiceTimeline({draft,leadInMs:60,tailOutMs:300,segments,audioDurationMs:assembledDurationMs});
    expect(timeline.durationMs).toBe(assembledDurationMs);expect(timeline.turns.at(-1)?.endMs).toBe(assembledDurationMs);expect(timeline.captions.at(-1)!.endMs).toBeLessThanOrEqual(assembledDurationMs);
  });

  it("keeps phrase-level local TTS boundaries through final timeline scaling",()=>{
    const draft=makeDialogueDraft();
    const segments=draft.turns.map((turn)=>{
      const chunks=segmentChineseCaptionText(turn.voiceText);const durationMs=5300;const chunkDuration=Math.floor(durationMs/chunks.length);
      return {turnId:turn.id,durationMs,boundaries:chunks.map((text,index)=>({text,offsetMs:index*chunkDuration,durationMs:index===chunks.length-1?durationMs-index*chunkDuration:chunkDuration}))};
    });
    const timeline=buildDialogueVoiceTimeline({draft,leadInMs:60,tailOutMs:300,segments,audioDurationMs:276000});
    expect(timeline.captions.every((caption)=>caption.alignmentSource==="edge-word-boundary"&&(caption.tokens?.length??0)>0)).toBe(true);
  });
});
