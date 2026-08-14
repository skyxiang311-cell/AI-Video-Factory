import {describe,expect,it} from "vitest";
import {DIALOGUE_VOICE_SETTINGS,buildDialogueVoiceFingerprint} from "../src/research/book/book-dialogue-voice";
import {makeDialogueDraft} from "./fixtures/book-dialogue";
import {DialogueDraftSchema} from "../src/research/book/book-dialogue-schema";
import {MacOsSayTtsAdapter,buildMacOsSayArgs,buildMacOsSayBoundaryPlan} from "../src/voice/macos-say-tts-adapter";

describe("dialogue voice configuration",()=>{
  it("locks visibly different fixed local female and male voices",()=>{
    expect(DIALOGUE_VOICE_SETTINGS.xiaoyuan.voice).toBe("Flo (中文（中国大陆）)");
    expect(DIALOGUE_VOICE_SETTINGS.douzai.voice).toBe("Eddy (中文（中国大陆）)");
    expect(DIALOGUE_VOICE_SETTINGS.xiaoyuan.rate).toBe(200);expect(DIALOGUE_VOICE_SETTINGS.douzai.rate).toBe(210);
    expect(DIALOGUE_VOICE_SETTINGS.xiaoyuan.voice).not.toBe(DIALOGUE_VOICE_SETTINGS.douzai.voice);
    expect(new MacOsSayTtsAdapter(DIALOGUE_VOICE_SETTINGS.xiaoyuan).provider).toBe("macos-say");
    expect(buildMacOsSayArgs(DIALOGUE_VOICE_SETTINGS.xiaoyuan,"/tmp/test.aiff","你好")).toEqual(["-v","Flo (中文（中国大陆）)","-r","200","-o","/tmp/test.aiff","你好"]);
    const draft=DialogueDraftSchema.parse(makeDialogueDraft());
    const first=buildDialogueVoiceFingerprint(draft);
    draft.turns[3]!.voiceText+="追问";
    expect(buildDialogueVoiceFingerprint(draft)).not.toBe(first);
  });

  it("builds exact local phrase boundaries instead of one whole-turn estimate",()=>{
    const plan=buildMacOsSayBoundaryPlan("作者提出一个判断，但证据范围必须单独核对，不能直接外推到所有时期。",[1200,1450,980],70);
    expect(plan).toHaveLength(3);
    expect(plan.map((boundary)=>boundary.text).join("")).toBe("作者提出一个判断，但证据范围必须单独核对，不能直接外推到所有时期。");
    expect(plan[1]!.offsetMs).toBe(plan[0]!.durationMs+70);
    expect(plan[2]!.offsetMs).toBe(plan[0]!.durationMs+70+plan[1]!.durationMs+70);
  });
});
