import {describe, expect, it} from "vitest";
import {BookDeepScriptSchema} from "../src/research/book/book-script-schema";
import {buildBookVideoStoryboard} from "../src/research/book/book-video-storyboard";
import {buildBookVideoVoiceFingerprint, finalizeBookVideoStoryboard, parseBookVideoVoiceManifest} from "../src/research/book/book-video-timing";
import {buildNarrationPlan} from "../src/narration/build-narration-plan";

const purposes = [
  "primary_hook", "hook_extension", "audience_relevance", "author_core_judgment",
  "strongest_evidence", "second_layer_mechanism", "critical_turn", "system_judgment",
  "memorable_ending",
] as const;
const endpoints = [[0,3],[3,8],[8,30],[30,75],[75,145],[145,200],[200,245],[245,285],[285,300]] as const;
const script = BookDeepScriptSchema.parse({
  title: "测试脚本", selectedAngleId: "angle-test", centralQuestion: "为什么结构比标签重要？",
  targetDurationSec: 300, durationSec: 300,
  segments: purposes.map((purpose, index) => ({
    purpose, startSec: endpoints[index]![0], endSec: endpoints[index]![1],
    text: `第${index + 1}段自然中文口播。`, voiceText: `第${index + 1}段自然中文口播。`,
    claimIds: [], sourceRefs: [], visibleSourceRequired: false,
  })),
  quality: {hook:10,centralQuestion:10,narrativeCoherence:15,evidence:15,depth:15,criticalThinking:10,practicalValue:10,spokenChinese:10,ending:5,overallScore:100,blockingIssues:[],status:"PASS"},
});

const audio = {
  src: "voice.mp3", provider: "edge-tts", voice: "zh-CN-XiaoxiaoNeural", rate: "+7%",
  pitch: "+0Hz", volume: "+0%", preset: "natural" as const, durationMs: 91_000, fingerprint: "fixture",
};

describe("Book video voice timing", () => {
  it("uses measured voice timing for scenes and dynamic Chinese captions", () => {
    const source = buildBookVideoStoryboard("sample-book", script);
    const sceneTimings = source.scenes.map((scene, index) => ({
      sceneId: scene.id,
      text: scene.voiceText,
      speechOffsetMs: 0,
      speechDurationMs: index === 0 ? 1700 : 9000,
      boundaries: [],
      startMs: index === 0 ? 0 : 1900 + (index - 1) * 11_100,
      endMs: index === source.scenes.length - 1 ? 91_000 : 1900 + index * 11_100,
      speechStartMs: index === 0 ? 60 : 1960 + (index - 1) * 11_100,
      speechEndMs: index === 0 ? 1760 : 10_960 + (index - 1) * 11_100,
    }));
    sceneTimings.at(-1)!.speechEndMs = 91_034;
    sceneTimings.at(-1)!.speechDurationMs = 11_374;

    const result = finalizeBookVideoStoryboard({source, audio, sceneTimings});

    expect(result.format.durationMs).toBe(91_000);
    expect(result.scenes[0]!.endMs).toBeLessThanOrEqual(3000);
    expect(result.scenes.at(-1)!.endMs).toBe(91_000);
    expect(result.captions.length).toBeGreaterThanOrEqual(result.scenes.length);
    expect(result.captions.every((caption) => caption.text.length <= 24)).toBe(true);
  });

  it("blocks a measured primary hook that exceeds three seconds", () => {
    const source = buildBookVideoStoryboard("sample-book", script);
    const timing = source.scenes.map((scene, index) => ({
      sceneId: scene.id, text: scene.voiceText, speechOffsetMs: 0, speechDurationMs: 1000,
      boundaries: [], startMs: index * 1000, endMs: (index + 1) * 1000,
      speechStartMs: index * 1000, speechEndMs: (index + 1) * 1000,
    }));
    timing[0]!.endMs = 3001;
    timing[1]!.startMs = 3001;

    expect(() => finalizeBookVideoStoryboard({...{source, audio: {...audio, durationMs: 9000}}, sceneTimings: timing})).toThrow(/Primary Hook/);
  });

  it("rejects a stale voice manifest from a different storyboard", () => {
    const source = buildBookVideoStoryboard("sample-book", script);
    const normalizedParts = buildNarrationPlan(source).blocks.flatMap((block) => block.parts);
    const settings = {voice: audio.voice, rate: audio.rate, pitch: audio.pitch, volume: audio.volume};
    const manifest = {
      schemaVersion: "1.0",
      jobId: "sample-book",
      provider: "edge-tts",
      preset: "natural",
      ...settings,
      fingerprint: buildBookVideoVoiceFingerprint(source, settings),
      durationMs: 9000,
      sceneTimings: normalizedParts.map((part, index) => ({
        sceneId: part.sceneId, text: part.text, speechOffsetMs: 0, speechDurationMs: 1000,
        boundaries: [], startMs: index * 1000, endMs: (index + 1) * 1000,
        speechStartMs: index * 1000, speechEndMs: (index + 1) * 1000,
      })),
    };
    expect(parseBookVideoVoiceManifest(source, manifest).jobId).toBe("sample-book");
    expect(() => parseBookVideoVoiceManifest(source, {...manifest, jobId: "other-book"})).toThrow(/jobId/);
    expect(() => parseBookVideoVoiceManifest(source, {...manifest, fingerprint: "stale"})).toThrow(/fingerprint/);
    expect(() => parseBookVideoVoiceManifest(source, {
      ...manifest,
      sceneTimings: manifest.sceneTimings.map((timing, index) => index === 2 ? {...timing, text: "旧口播"} : timing),
    })).toThrow(/口播文本/);
  });
});
