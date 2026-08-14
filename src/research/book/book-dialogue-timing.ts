import {alignSceneCaptions, type VoiceBoundary} from "../../subtitles/voice-caption-alignment";
import {DialogueDraftSchema, DialogueScriptSchema, type DialogueDraft} from "./book-dialogue-schema";

export type DialogueVoiceSegment = {turnId: string; durationMs: number; boundaries: VoiceBoundary[]};

export const dialoguePauseAfterMs = (turn: DialogueDraft["turns"][number], next?: DialogueDraft["turns"][number]): number => {
  if (!next) return 0;
  if (turn.purpose === "phase3c_challenge" || turn.purpose === "twist" || turn.purpose === "summary") return 420;
  if (turn.speaker !== next.speaker) return 240;
  return 180;
};

export const buildDialogueVoiceTimeline = (input: {draft: unknown; segments: DialogueVoiceSegment[]; leadInMs: number; tailOutMs: number; audioDurationMs?: number}) => {
  const draft = DialogueDraftSchema.parse(input.draft);
  if (input.segments.length !== draft.turns.length) throw new Error("dialogue voice segments 与 turns 数量不一致");
  const nonSpeechMs=input.leadInMs+input.tailOutMs+draft.turns.reduce((sum,turn,index)=>sum+dialoguePauseAfterMs(turn,draft.turns[index+1]),0);
  const originalSpeechMs=input.segments.reduce((sum,segment)=>sum+segment.durationMs,0);const speechBudgetMs=input.audioDurationMs===undefined?originalSpeechMs:input.audioDurationMs-nonSpeechMs;
  if(speechBudgetMs<=0||originalSpeechMs<=0)throw new Error("dialogue voice 没有可用的真实口播时长");
  const scale=speechBudgetMs/originalSpeechMs;const scaledDurations=input.segments.map((segment)=>Math.max(1,Math.round(segment.durationMs*scale)));scaledDurations[scaledDurations.length-1]!+=speechBudgetMs-scaledDurations.reduce((sum,value)=>sum+value,0);
  const normalizedSegments=input.segments.map((segment,index)=>{const durationMs=scaledDurations[index]!;const ratio=durationMs/segment.durationMs;return {...segment,durationMs,boundaries:segment.boundaries.map((boundary)=>({...boundary,offsetMs:Math.round(boundary.offsetMs*ratio),durationMs:Math.max(1,Math.round(boundary.durationMs*ratio))}))};});
  let cursor = 0;
  const captions: Array<ReturnType<typeof alignSceneCaptions>[number] & {turnId: string; speaker: DialogueDraft["turns"][number]["speaker"]}> = [];
  const turns = draft.turns.map((turn, index) => {
    const segment = normalizedSegments[index]!;
    if (segment.turnId !== turn.id) throw new Error(`dialogue voice segment 顺序不一致：${turn.id}`);
    const startMs = cursor;
    const speechStartMs = startMs + (index === 0 ? input.leadInMs : 0);
    const speechEndMs = speechStartMs + segment.durationMs;
    const isLast = index === draft.turns.length - 1;
    const endMs = speechEndMs + (isLast ? input.tailOutMs : dialoguePauseAfterMs(turn, draft.turns[index + 1]));
    cursor = endMs;
    captions.push(...alignSceneCaptions({sceneId: turn.id, text: turn.voiceText, speechStartMs, speechEndMs, emphasis: [], boundaries: segment.boundaries}).map((caption) => ({...caption, turnId: turn.id, speaker: turn.speaker})));
    return {...turn, startMs, endMs, speechStartMs, speechEndMs};
  });
  const durationMs = input.audioDurationMs ?? cursor;
  if (Math.abs(durationMs-cursor)>120) throw new Error("合并后的 dialogue voice 与 turn timing 不一致");
  turns.at(-1)!.endMs=durationMs;
  if (durationMs < 270000 || durationMs > 330000) throw new Error(`双角色真实音频时长必须在 270–330 秒，实际 ${durationMs}ms`);
  let currentStart: number | undefined;
  let maxXiaoyuanMonologueMs = 0;
  turns.forEach((turn, index) => {
    if (turn.speaker === "xiaoyuan") currentStart ??= turn.speechStartMs;
    const next = turns[index + 1];
    if (currentStart !== undefined && (!next || next.speaker !== "xiaoyuan")) {
      maxXiaoyuanMonologueMs = Math.max(maxXiaoyuanMonologueMs, turn.speechEndMs - currentStart);
      currentStart = undefined;
    }
  });
  if (maxXiaoyuanMonologueMs > 15000) throw new Error(`小圆连续独白超过 15 秒：${maxXiaoyuanMonologueMs}ms`);
  const speakerDuration = (speaker: string) => turns.filter((turn) => turn.speaker === speaker).reduce((sum, turn) => sum + turn.speechEndMs - turn.speechStartMs, 0);
  const narratorDurationShare = speakerDuration("narrator") / Math.max(1, turns.reduce((sum, turn) => sum + turn.speechEndMs - turn.speechStartMs, 0));
  if (narratorDurationShare > .1) throw new Error("narrator 实际口播占比超过 10%");
  const finalScript = DialogueScriptSchema.parse({...draft, durationMs, turns, captions, quality: {
    status: "PASS", blockingIssues: [],
    xiaoyuanTurns: turns.filter((turn) => turn.speaker === "xiaoyuan").length,
    douzaiTurns: turns.filter((turn) => turn.speaker === "douzai").length,
    narratorTurns: turns.filter((turn) => turn.speaker === "narrator").length,
    narratorDurationShare, maxXiaoyuanMonologueMs, phase3CCritiquePresent: true,
  }});
  return {...finalScript, maxXiaoyuanMonologueMs};
};
