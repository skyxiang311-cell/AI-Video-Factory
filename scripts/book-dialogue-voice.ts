import {createHash} from "node:crypto";
import {mkdir,readFile,stat} from "node:fs/promises";
import {resolve} from "node:path";
import {DialogueDraftSchema} from "../src/research/book/book-dialogue-schema";
import {assertDialogueDraftQuality} from "../src/research/book/book-dialogue-quality";
import {buildDialogueVoiceTimeline,dialoguePauseAfterMs} from "../src/research/book/book-dialogue-timing";
import {buildDialogueVoiceFingerprint,DIALOGUE_VOICE_SETTINGS} from "../src/research/book/book-dialogue-voice";
import {assertDialogueSourceLock} from "../src/research/book/book-dialogue-verification";
import {atomicWriteJson} from "../src/shared/atomic-write";
import {inspectMediaFile} from "../src/shared/media-inspection";
import {assembleVoiceTrack} from "../src/voice/assemble-voice-track";
import {MacOsSayTtsAdapter} from "../src/voice/macos-say-tts-adapter";
import {postProcessVoice} from "../src/voice/ffmpeg-voice-postprocessor";
import {trimVoiceSegment} from "../src/voice/trim-voice-segment";

const parseJobId=(argv:string[])=>{if(argv.length!==1||!argv[0]||!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0]))throw new Error("Usage: npm run book:dialogue-voice -- <job-id>");return argv[0];};
export const runBookDialogueVoiceCli=async(argv=process.argv.slice(2)):Promise<void>=>{
  const jobId=parseJobId(argv);const directory=resolve("output",jobId);
  const [draftText,lockText,script,expandedScript,selectedAngle,bookSynthesis]=await Promise.all([readFile(resolve(directory,"dialogue-draft.json"),"utf8"),readFile(resolve(directory,"dialogue-source-lock.json"),"utf8"),readFile(resolve(directory,"script.json"),"utf8"),readFile(resolve(directory,"video-script.json"),"utf8"),readFile(resolve(directory,"book/selected-angle.json"),"utf8"),readFile(resolve(directory,"book/book-synthesis.json"),"utf8")]);
  const draft=DialogueDraftSchema.parse(JSON.parse(draftText));const lock=JSON.parse(lockText) as {inputHashes:Record<string,string>;allowedClaimIds:string[];allowedSourceRefs:string[];requiredClaimIds:string[];requiredSourceRefs:string[]};assertDialogueSourceLock({lock,script,expandedScript,selectedAngle,bookSynthesis});
  assertDialogueDraftQuality({draft,allowedClaimIds:new Set(lock.allowedClaimIds),allowedSourceRefs:new Set(lock.allowedSourceRefs),requiredClaimIds:new Set(lock.requiredClaimIds),requiredSourceRefs:new Set(lock.requiredSourceRefs)});
  const adapters={xiaoyuan:new MacOsSayTtsAdapter(DIALOGUE_VOICE_SETTINGS.xiaoyuan),douzai:new MacOsSayTtsAdapter(DIALOGUE_VOICE_SETTINGS.douzai),narrator:new MacOsSayTtsAdapter(DIALOGUE_VOICE_SETTINGS.narrator)};
  const rawDirectory=resolve(directory,"dialogue-voice-segments","raw");const trimmedDirectory=resolve(directory,"dialogue-voice-segments","trimmed");await Promise.all([mkdir(rawDirectory,{recursive:true}),mkdir(trimmedDirectory,{recursive:true})]);
  const synthesized=[] as Array<{turnId:string;speaker:keyof typeof adapters;text:string;durationMs:number;boundaries:Array<{text:string;offsetMs:number;durationMs:number}>;path:string}>;
  for(const [index,turn] of draft.turns.entries()){
    console.log(`生成双角色配音 ${index+1}/${draft.turns.length}：${turn.speaker} ${turn.id}`);
    const raw=await adapters[turn.speaker].synthesize({segmentId:turn.id,text:turn.voiceText,audioPath:resolve(rawDirectory,`${turn.id}.mp3`)});
    const trimmed=await trimVoiceSegment(raw,resolve(trimmedDirectory,`${turn.id}.mp3`));
    synthesized.push({turnId:turn.id,speaker:turn.speaker,text:turn.voiceText,durationMs:trimmed.durationMs,boundaries:trimmed.boundaries,path:trimmed.audioPath});
  }
  const rawVoice=resolve(directory,"dialogue-voice.raw.mp3");const voicePath=resolve(directory,"dialogue-voice.mp3");
  await assembleVoiceTrack({segments:synthesized.map((segment,index)=>({path:segment.path,pauseAfterMs:dialoguePauseAfterMs(draft.turns[index]!,draft.turns[index+1])})),outputPath:rawVoice,leadInMs:60,tailOutMs:300});
  const postProcess=await postProcessVoice(rawVoice,voicePath);const [media,stats,voiceBytes]=await Promise.all([inspectMediaFile(voicePath),stat(voicePath),readFile(voicePath)]);
  if(!media.canRead||media.audioTracks.length!==1||media.videoTracks.length)throw new Error("dialogue-voice.mp3 媒体结构无效");
  const timeline=buildDialogueVoiceTimeline({draft,segments:synthesized.map(({turnId,durationMs,boundaries})=>({turnId,durationMs,boundaries})),leadInMs:60,tailOutMs:300,audioDurationMs:media.durationMs});
  const manifest={schemaVersion:"1.0",jobId,provider:"macos-say",fingerprint:buildDialogueVoiceFingerprint(draft),audioSha256:createHash("sha256").update(voiceBytes).digest("hex"),durationMs:media.durationMs,sizeBytes:stats.size,voices:DIALOGUE_VOICE_SETTINGS,postProcess,segments:synthesized.map((segment,index)=>({...segment,path:`dialogue-voice-segments/trimmed/${segment.turnId}.mp3`,pauseAfterMs:dialoguePauseAfterMs(draft.turns[index]!,draft.turns[index+1])}))};
  await Promise.all([atomicWriteJson(resolve(directory,"dialogue-script.json"),timeline),atomicWriteJson(resolve(directory,"dialogue-subtitles.json"),{schemaVersion:"1.0",jobId,durationMs:timeline.durationMs,captions:timeline.captions}),atomicWriteJson(resolve(directory,"dialogue-voice.json"),manifest)]);
  console.log(JSON.stringify({jobId,durationMs:media.durationMs,xiaoyuanTurns:timeline.quality.xiaoyuanTurns,douzaiTurns:timeline.quality.douzaiTurns,narratorTurns:timeline.quality.narratorTurns,voices:{xiaoyuan:DIALOGUE_VOICE_SETTINGS.xiaoyuan.voice,douzai:DIALOGUE_VOICE_SETTINGS.douzai.voice}}));
};
if(process.argv[1]&&resolve(process.argv[1])===resolve("scripts/book-dialogue-voice.ts"))await runBookDialogueVoiceCli();
