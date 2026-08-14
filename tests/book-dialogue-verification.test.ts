import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {assertDialogueOutputContract,assertDialogueSourceLock} from "../src/research/book/book-dialogue-verification";
import {buildDialogueVoiceTimeline} from "../src/research/book/book-dialogue-timing";
import {buildComicDialogueStoryboard} from "../src/research/book/book-dialogue-storyboard";
import {makeDialogueDraft} from "./fixtures/book-dialogue";
import {buildDialogueVoiceFingerprint} from "../src/research/book/book-dialogue-voice";

describe("dialogue comic output contract",()=>{
  it("locks script, traceability, distinct voices and shot mix",()=>{
    const draft=makeDialogueDraft();const timeline=buildDialogueVoiceTimeline({draft,leadInMs:60,tailOutMs:300,segments:draft.turns.map((turn,index)=>({turnId:turn.id,durationMs:index===2?12000:5300,boundaries:[]}))});const scriptText=JSON.stringify(timeline);const hash=createHash("sha256").update(scriptText).digest("hex");
    const fingerprint=buildDialogueVoiceFingerprint(timeline);const storyboard=buildComicDialogueStoryboard({jobId:"sample",timeline,referenceImage:"dialogue-assets/character-reference.png",audioSha256:"a".repeat(64),dialogueScriptSha256:hash,sourceLockSha256:"c".repeat(64),voiceFingerprint:fingerprint});
    const voices={xiaoyuan:{voice:"zh-CN-XiaoxiaoNeural"},douzai:{voice:"zh-CN-YunxiNeural"},narrator:{voice:"zh-CN-YunyangNeural"}};
    const voiceManifest={durationMs:timeline.durationMs,voices,fingerprint,audioSha256:"a".repeat(64),segments:timeline.turns.map((turn)=>({turnId:turn.id,speaker:turn.speaker,text:turn.voiceText}))};
    expect(()=>assertDialogueOutputContract({script:timeline,scriptText,storyboard,voiceManifest})).not.toThrow();
    const tampered={...storyboard,shots:storyboard.shots.map((shot,index)=>index===4?{...shot,claimIds:[]}:shot)};
    expect(()=>assertDialogueOutputContract({script:timeline,scriptText,storyboard:tampered,voiceManifest})).toThrow(/traceability/u);
    const staticShot={...storyboard,shots:storyboard.shots.map((shot,index)=>index===2?{...shot,visualBeats:[{atMs:0 as const,kind:"cut" as const},{atMs:1000,kind:"reaction" as const}]}:shot)};
    expect(()=>assertDialogueOutputContract({script:timeline,scriptText,storyboard:staticShot,voiceManifest})).toThrow(/视觉变化/u);
    const wrongSpeaker={...storyboard,shots:storyboard.shots.map((shot,index)=>index===3?{...shot,speaker:"douzai" as const}:shot)};expect(()=>assertDialogueOutputContract({script:timeline,scriptText,storyboard:wrongSpeaker,voiceManifest})).toThrow(/turn binding/u);
    expect(()=>assertDialogueOutputContract({script:timeline,scriptText,storyboard,voiceManifest:{...voiceManifest,fingerprint:"d".repeat(64)}})).toThrow(/fingerprint/u);
    expect(()=>assertDialogueOutputContract({script:timeline,scriptText,storyboard,voiceManifest:{...voiceManifest,segments:voiceManifest.segments.map((segment,index)=>index===2?{...segment,text:"错误台词"}:segment)}})).toThrow(/voice segment/u);
  });

  it("keeps the locked source scripts bound through the final chain",()=>{const values={script:"script",expandedScript:"expanded",selectedAngle:"angle",bookSynthesis:"synthesis"};const inputHashes=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,createHash("sha256").update(value).digest("hex")]));expect(()=>assertDialogueSourceLock({lock:{inputHashes},...values})).not.toThrow();expect(()=>assertDialogueSourceLock({lock:{inputHashes},...values,script:"changed"})).toThrow(/source lock/u);});

  it("accepts only tiny measured phrase pauses between acoustically-bound captions",()=>{
    const draft=makeDialogueDraft();const timeline=buildDialogueVoiceTimeline({draft,leadInMs:60,tailOutMs:300,segments:draft.turns.map((turn)=>({turnId:turn.id,durationMs:5300,boundaries:[]}))});
    const index=timeline.captions.findIndex((caption,captionIndex)=>captionIndex>0&&timeline.captions[captionIndex-1]!.turnId===caption.turnId);expect(index).toBeGreaterThan(0);
    const make=(gapMs:number)=>{const script={...timeline,captions:timeline.captions.map((caption,captionIndex)=>captionIndex===index?{...caption,startMs:caption.startMs+gapMs}:caption)};const scriptText=JSON.stringify(script);const fingerprint=buildDialogueVoiceFingerprint(script);const storyboard=buildComicDialogueStoryboard({jobId:"sample",timeline:script,referenceImage:"dialogue-assets/character-reference.png",audioSha256:"a".repeat(64),dialogueScriptSha256:createHash("sha256").update(scriptText).digest("hex"),sourceLockSha256:"c".repeat(64),voiceFingerprint:fingerprint});const voiceManifest={durationMs:script.durationMs,voices:{xiaoyuan:{voice:storyboard.audio.voices.xiaoyuan},douzai:{voice:storyboard.audio.voices.douzai},narrator:{voice:storyboard.audio.voices.narrator}},fingerprint,audioSha256:"a".repeat(64),segments:script.turns.map((turn)=>({turnId:turn.id,speaker:turn.speaker,text:turn.voiceText}))};return()=>assertDialogueOutputContract({script,scriptText,storyboard,voiceManifest});};
    expect(make(70)).not.toThrow();expect(make(180)).toThrow(/subtitle turn binding/u);
  });
});
