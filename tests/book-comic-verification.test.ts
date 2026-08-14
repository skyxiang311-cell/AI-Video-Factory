import {describe, expect, it} from "vitest";
import {createHash} from "node:crypto";
import {assertComicContentBindings, assertComicStoryboardPacing} from "../src/research/book/book-comic-verification";

const makeShots = (count = 40) => Array.from({length: count}, (_, index) => ({
  id: `comic-shot-${String(index + 1).padStart(3, "0")}`,
  startMs: index * 7500, endMs: (index + 1) * 7500,
  turns: index === 0 ? [{speaker: "douzai"}, {speaker: "xiaoyuan"}] : [{speaker: "xiaoyuan"}],
  visualBeats: [{atMs: 0}, {atMs: 2500}, {atMs: 5000}, {atMs: 7000}],
}));

describe("comic video verification", () => {
  it("accepts 40 traceable, frequently changing comic shots", () => {
    expect(assertComicStoryboardPacing(makeShots())).toMatchObject({sceneCount: 40, longestShotMs: 7500, longestBeatGapMs: 2500});
  });

  it("rejects static shots over eight seconds", () => {
    const shots = makeShots();
    shots[4]!.endMs += 600;
    expect(() => assertComicStoryboardPacing(shots)).toThrow(/8 秒/u);
  });

  it("blocks a changed locked script, voice, reference image, or subtitle track", () => {
    const scriptText = "{\"locked\":true}";
    const sourceText = "{\"source\":true}";
    const voice = Buffer.from("voice-bytes");
    const reference = Buffer.from("reference-bytes");
    const captions = [{text: "原字幕", startMs: 10, endMs: 1000, timestampMs: 10, confidence: null}];
    const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
    const storyboard = {
      lockedScriptSha256: hash(scriptText), sourceStoryboardSha256: hash(sourceText), referenceImageSha256: hash(reference), captionsSha256: hash(JSON.stringify(captions)),
      audio: {reused: true as const, src: "voice.mp3" as const, fingerprint: "f".repeat(64), durationMs: 300000, sha256: hash(voice)}, captions,
      shots: [{turns: [{sourceSceneId: "scene-1", text: "原口播", startMs: 0, endMs: 300000}], originalSceneIds: ["scene-1"], claimIds: ["claim-one"], sourceRefs: [{type: "book" as const, chapterId: "chapter-001", page: 1, blockId: "p1-b1"}]}],
    };
    const bindings = {scriptText, sourceStoryboardText: sourceText, voiceBytes: voice, referenceBytes: reference, voiceFingerprint: "f".repeat(64), voiceDurationMs: 300000, subtitleCaptions: captions, sourceScenes: [{id: "scene-1", voiceText: "原口播", startMs: 0, endMs: 300000, claimIds: ["claim-one"], sourceRefs: [{type: "book" as const, chapterId: "chapter-001", page: 1, blockId: "p1-b1"}]}]};
    expect(() => assertComicContentBindings(storyboard, bindings)).not.toThrow();
    expect(() => assertComicContentBindings(storyboard, {...bindings, scriptText: `${scriptText} `})).toThrow(/script/u);
    expect(() => assertComicContentBindings(storyboard, {...bindings, voiceBytes: Buffer.from("other")})).toThrow(/voice/u);
    expect(() => assertComicContentBindings(storyboard, {...bindings, referenceBytes: Buffer.from("other")})).toThrow(/角色/u);
    expect(() => assertComicContentBindings(storyboard, {...bindings, subtitleCaptions: [{...captions[0]!, text: "篡改"}]})).toThrow(/字幕/u);
    expect(() => assertComicContentBindings({...storyboard, shots: [{...storyboard.shots[0]!, claimIds: []}]}, bindings)).toThrow(/追溯/u);
  });
});
