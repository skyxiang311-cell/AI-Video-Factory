import {describe, expect, it} from "vitest";
import {assertDialogueDraftQuality} from "../src/research/book/book-dialogue-quality";
import {buildDeterministicDialogueDraft} from "../src/research/book/book-dialogue-adapter";
import {BookDeepScriptSchema} from "../src/research/book/book-script-schema";
import {makeDialogueDraft} from "./fixtures/book-dialogue";

describe("true dialogue adapter quality gate", () => {
  it("accepts a substantive 50-turn evidence-locked dialogue", () => {
    const report = assertDialogueDraftQuality({
      draft: makeDialogueDraft(),
      allowedClaimIds: new Set(["claim-012-middle-class-social-function"]),
      allowedSourceRefs: new Set(["chapter-012:264:p264-b20"]),
      requiredClaimIds: new Set(["claim-012-middle-class-social-function"]),
      requiredSourceRefs: new Set(["chapter-012:264:p264-b20"]),
    });
    expect(report.blockingIssues).toEqual([]);
    expect(report.turnCount).toBe(50);
    expect(report.xiaoyuanTurns).toBeGreaterThanOrEqual(20);
    expect(report.douzaiTurns).toBeGreaterThanOrEqual(15);
    expect(report.narratorCharacterShare).toBeLessThanOrEqual(.1);
    expect(report.phase3CCritiquePresent).toBe(true);
  });

  it("blocks filler dialogue and dangling traceability", () => {
    const draft = makeDialogueDraft();
    draft.turns[3] = {...draft.turns[3]!, text: "真的吗？", voiceText: "真的吗？", claimIds: ["claim-missing"]};
    expect(() => assertDialogueDraftQuality({
      draft,
      allowedClaimIds: new Set(["claim-012-middle-class-social-function"]),
      allowedSourceRefs: new Set(["chapter-012:264:p264-b20"]),
      requiredClaimIds: new Set(), requiredSourceRefs: new Set(),
    })).toThrow(/假对话|dangling/u);
  });

  it("blocks mechanical question fragments and broken punctuation",()=>{
    const draft=makeDialogueDraft();draft.turns[2]={...draft.turns[2]!,speaker:"douzai",text:"换句话说，再检查它能不能支持，？",voiceText:"换句话说，再检查它能不能支持，？",purpose:"follow_up",emotion:"curious",characterPose:"ask",visualIntent:"douzai_closeup"};
    expect(()=>assertDialogueDraftQuality({draft,allowedClaimIds:new Set(["claim-012-middle-class-social-function"]),allowedSourceRefs:new Set(["chapter-012:264:p264-b20"]),requiredClaimIds:new Set(),requiredSourceRefs:new Set()})).toThrow(/病句/u);
  });

  it("deterministically redistributes a locked expanded script into evidence-bound dialogue",()=>{
    const purposes=["primary_hook","hook_extension","audience_relevance","author_core_judgment","strongest_evidence","second_layer_mechanism","critical_turn","system_judgment","memorable_ending"] as const;
    const sourceRefs=purposes.map((_,index)=>({type:"book" as const,chapterId:"chapter-012",page:264+index,blockId:`p${264+index}-b20`}));
    const extraRefs=Array.from({length:8},(_,index)=>({type:"book" as const,chapterId:"chapter-012",page:300+index,blockId:`p${300+index}-b1`}));const allRefs=[...sourceRefs,...extraRefs];
    const script=BookDeepScriptSchema.parse({title:"锁定扩展稿",selectedAngleId:"angle-001",centralQuestion:"作者的判断能由哪些材料支持？",targetDurationSec:300,durationSec:300,segments:purposes.map((purpose,index)=>({purpose,startSec:index*30,endSec:index===8?300:(index+1)*30,text:Array.from({length:index<3?7:6},(_,part)=>`第${index+1}段第${part+1}句只保留作者原文支持的观察范围，且不外推。`).join(""),voiceText:Array.from({length:index<3?7:6},(_,part)=>`第${index+1}段第${part+1}句只保留作者原文支持的观察范围，且不外推。`).join(""),claimIds:["claim-012-middle-class-social-function"],sourceRefs:index===4?[sourceRefs[index]!,...extraRefs]:[sourceRefs[index]!],visibleSourceRequired:false})),quality:{hook:10,centralQuestion:10,narrativeCoherence:15,evidence:15,depth:15,criticalThinking:10,practicalValue:10,spokenChinese:10,ending:5,overallScore:100,blockingIssues:[],status:"PASS"}});
    const first=buildDeterministicDialogueDraft(script);const second=buildDeterministicDialogueDraft(script);expect(first).toEqual(second);
    expect(first.turns.every((turn)=>turn.sourceRefs.length<=8)).toBe(true);expect(new Set(first.turns.flatMap((turn)=>turn.sourceRefs.map((ref)=>`${ref.chapterId}:${ref.page}:${ref.blockId}`)))).toEqual(new Set(allRefs.map((ref)=>`${ref.chapterId}:${ref.page}:${ref.blockId}`)));
    expect(first.turns.length).toBeGreaterThanOrEqual(45);expect(first.turns.length).toBeLessThanOrEqual(65);expect(first.turns[0]?.speaker).toBe("douzai");expect(first.turns[1]?.speaker).toBe("xiaoyuan");
    const challenge=first.turns.findIndex((turn)=>turn.purpose==="phase3c_challenge");expect(challenge).toBeGreaterThanOrEqual(0);expect(first.turns[challenge+1]?.purpose).toBe("correction");
    const douzaiTurns=first.turns.filter((turn)=>turn.speaker==="douzai");
    expect(douzaiTurns.every((turn)=>/[？?]$/u.test(turn.voiceText)&&!/[，,：:；;][？?]$/u.test(turn.voiceText))).toBe(true);
    const narratorTexts=first.turns.filter((turn)=>turn.speaker==="narrator").map((turn)=>turn.voiceText);
    expect(narratorTexts.length).toBeGreaterThan(0);
    expect(new Set(narratorTexts).size).toBe(narratorTexts.length);
    expect(first.turns.some((turn)=>/^(?:你是说|换句话说|也就是说|那我确认一下)[，,]/u.test(turn.voiceText))).toBe(false);
    expect(new Set(first.turns.map((turn)=>turn.voiceText)).size).toBe(first.turns.length);
    for(const [index,turn] of first.turns.entries()){
      if(turn.speaker!=="douzai"||index===0)continue;
      const answer=first.turns[index+1];
      expect(answer?.speaker).toBe("xiaoyuan");
      const questionRefs=new Set(turn.sourceRefs.map((ref)=>`${ref.chapterId}:${ref.page}:${ref.blockId}`));
      expect(turn.claimIds.some((id)=>answer?.claimIds.includes(id))||answer?.sourceRefs.some((ref)=>questionRefs.has(`${ref.chapterId}:${ref.page}:${ref.blockId}`))).toBe(true);
    }
  });

  it("blocks repeated narrator fillers and unanswered substantive questions",()=>{
    const draft=makeDialogueDraft();
    draft.turns[2]={...draft.turns[2]!,speaker:"narrator",text:"换个角度。",voiceText:"换个角度。",purpose:"transition",claimIds:[],sourceRefs:[],emotion:"neutral",characterPose:"neutral",visualIntent:"two_shot"};
    draft.turns[7]={...draft.turns[7]!,speaker:"narrator",text:"换个角度。",voiceText:"换个角度。",purpose:"transition",claimIds:[],sourceRefs:[],emotion:"neutral",characterPose:"neutral",visualIntent:"two_shot"};
    expect(()=>assertDialogueDraftQuality({draft,allowedClaimIds:new Set(["claim-012-middle-class-social-function"]),allowedSourceRefs:new Set(["chapter-012:264:p264-b20"]),requiredClaimIds:new Set(),requiredSourceRefs:new Set()})).toThrow(/旁白转场重复/u);
  });
});
