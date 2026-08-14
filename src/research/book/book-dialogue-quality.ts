import {countReadableCharacters} from "../../storyboard/caption-layout";
import {DialogueDraftSchema, type DialogueDraft} from "./book-dialogue-schema";

const refKey = (ref: {chapterId: string; page: number; blockId: string}) => `${ref.chapterId}:${ref.page}:${ref.blockId}`;
const filler = /^(?:嗯+|哦+|啊+|真的吗[？?]?|原来如此[。！!]?)$/u;

export const assertDialogueDraftQuality = (input: {
  draft: unknown;
  allowedClaimIds: Set<string>;
  allowedSourceRefs: Set<string>;
  requiredClaimIds: Set<string>;
  requiredSourceRefs: Set<string>;
}) => {
  const draft = DialogueDraftSchema.parse(input.draft);
  const blockingIssues: string[] = [];
  const speakers = draft.turns.map((turn) => turn.speaker);
  const xiaoyuanTurns = speakers.filter((speaker) => speaker === "xiaoyuan").length;
  const douzaiTurns = speakers.filter((speaker) => speaker === "douzai").length;
  const narratorTurns = speakers.filter((speaker) => speaker === "narrator").length;
  const totalCharacters = draft.turns.reduce((sum, turn) => sum + countReadableCharacters(turn.voiceText), 0);
  const narratorCharacters = draft.turns.filter((turn) => turn.speaker === "narrator").reduce((sum, turn) => sum + countReadableCharacters(turn.voiceText), 0);
  const xiaoyuanCharacters = draft.turns.filter((turn) => turn.speaker === "xiaoyuan").reduce((sum, turn) => sum + countReadableCharacters(turn.voiceText), 0);
  const douzaiCharacters = draft.turns.filter((turn) => turn.speaker === "douzai").reduce((sum, turn) => sum + countReadableCharacters(turn.voiceText), 0);
  const narratorCharacterShare = totalCharacters ? narratorCharacters / totalCharacters : 1;
  const xiaoyuanCharacterShare = totalCharacters ? xiaoyuanCharacters / totalCharacters : 0;
  const douzaiCharacterShare = totalCharacters ? douzaiCharacters / totalCharacters : 0;
  if (totalCharacters < 1250 || totalCharacters > 1650) blockingIssues.push("总口播字数必须为 1250–1650");
  if (xiaoyuanCharacterShare < .55 || xiaoyuanCharacterShare > .65) blockingIssues.push("小圆口播占比必须为 55–65%");
  if (douzaiCharacterShare < .3 || douzaiCharacterShare > .4) blockingIssues.push("豆仔口播占比必须为 30–40%");
  if (xiaoyuanTurns < 20) blockingIssues.push("xiaoyuan dialogue turns < 20");
  if (douzaiTurns < 15) blockingIssues.push("douzai dialogue turns < 15");
  if (narratorCharacterShare > .1) blockingIssues.push("narrator 占比超过 10%");
  if (draft.turns.some((turn) => turn.speaker === "douzai" && (filler.test(turn.voiceText.trim()) || countReadableCharacters(turn.voiceText) < 8))) blockingIssues.push("存在不推进解释的假对话");
  if(draft.turns.some((turn)=>/[，,：:；;][？?]$/u.test(turn.voiceText)||/^(?:你是说|换句话说|也就是说|那我确认一下)[，,](?:才能|再|否则|没有|但|还是|无法|必须|最后|也不会)/u.test(turn.voiceText)))blockingIssues.push("存在机械问句病句");
  const narratorTexts=draft.turns.filter((turn)=>turn.speaker==="narrator").map((turn)=>turn.voiceText.trim());
  if(new Set(narratorTexts).size!==narratorTexts.length)blockingIssues.push("旁白转场重复");
  if (draft.turns.some((turn) => turn.claimIds.some((id) => !input.allowedClaimIds.has(id)))) blockingIssues.push("存在 dangling claimIds");
  if (draft.turns.some((turn) => turn.sourceRefs.some((ref) => !input.allowedSourceRefs.has(refKey(ref))))) blockingIssues.push("存在 dangling sourceRefs");
  const usedClaims = new Set(draft.turns.flatMap((turn) => turn.claimIds));
  const usedRefs = new Set(draft.turns.flatMap((turn) => turn.sourceRefs.map(refKey)));
  if ([...input.requiredClaimIds].some((id) => !usedClaims.has(id))) blockingIssues.push("核心 Claim 未完整保留");
  if ([...input.requiredSourceRefs].some((key) => !usedRefs.has(key))) blockingIssues.push("核心 sourceRefs 未完整保留");
  const phase3CCritiquePresent = draft.turns.some((turn) => turn.purpose === "phase3c_challenge" && turn.sourceRefs.length > 0 && /因果|范围|外推|局限|不能|不等于/u.test(turn.voiceText));
  if (!phase3CCritiquePresent) blockingIssues.push("Phase3C critique 未进入真实对话");
  let consecutiveXiaoyuan = 0;
  for (const speaker of speakers) {
    consecutiveXiaoyuan = speaker === "xiaoyuan" ? consecutiveXiaoyuan + 1 : 0;
    if (consecutiveXiaoyuan > 3) blockingIssues.push("小圆连续独白 turn 过多");
  }
  for (let start = 0; start < draft.turns.length; start += 4) {
    const knowledgeWindow=draft.turns.slice(start,start+5);if(knowledgeWindow.length>=4&&!knowledgeWindow.some((turn) => turn.speaker === "douzai")) blockingIssues.push("豆仔未在每个知识段推进解释");
  }
  const questionPurposes=new Set(["question","follow_up","challenge","phase3c_challenge"]);
  let substantiveQuestions=0;let unansweredQuestions=0;
  draft.turns.forEach((turn,index)=>{
    if(turn.speaker!=="douzai"||!questionPurposes.has(turn.purpose))return;
    substantiveQuestions+=1;
    const answer=draft.turns[index+1];
    if(!answer||answer.speaker!=="xiaoyuan")unansweredQuestions+=1;
  });
  if(substantiveQuestions>0&&unansweredQuestions/substantiveQuestions>.2)blockingIssues.push("豆仔的实质问题没有形成稳定的紧接回答");
  if (blockingIssues.length) throw new Error(blockingIssues.join("；"));
  return {draft: draft as DialogueDraft, blockingIssues, turnCount: draft.turns.length, totalCharacters, xiaoyuanTurns, douzaiTurns, narratorTurns, xiaoyuanCharacterShare, douzaiCharacterShare, narratorCharacterShare, phase3CCritiquePresent};
};
