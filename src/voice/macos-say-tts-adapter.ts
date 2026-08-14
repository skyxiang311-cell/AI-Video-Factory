import {spawn} from "node:child_process";
import {stat,unlink} from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";
import {assembleVoiceTrack} from "./assemble-voice-track";
import {inspectMediaFile} from "../shared/media-inspection";
import {segmentChineseCaptionText,type VoiceBoundary} from "../subtitles/voice-caption-alignment";
import type {VoiceProvider,VoiceSynthesisRequest,VoiceSynthesisResult} from "./voice-provider";

export type MacOsSayVoiceSettings={voice:string;rate:number};
const PHRASE_GAP_MS=70;
const run=(command:string,args:string[],label:string)=>new Promise<void>((resolveProcess,reject)=>{const child=spawn(command,args,{stdio:"inherit"});child.once("error",reject);child.once("exit",(code,signal)=>code===0?resolveProcess():reject(new Error(`${label} failed: code=${String(code)} signal=${String(signal)}`)));});
export const buildMacOsSayArgs=(settings:MacOsSayVoiceSettings,aiffPath:string,text:string)=>["-v",settings.voice,"-r",String(settings.rate),"-o",aiffPath,text];
export const buildMacOsSayBoundaryPlan=(text:string,durationsMs:number[],gapMs=PHRASE_GAP_MS):VoiceBoundary[]=>{
  const chunks=segmentChineseCaptionText(text);if(chunks.length!==durationsMs.length)throw new Error("macOS say phrase durations 与字幕短语数量不一致");
  let cursor=0;return chunks.map((chunk,index)=>{const durationMs=durationsMs[index]!;const boundary={text:chunk,offsetMs:cursor,durationMs};cursor+=durationMs+(index===chunks.length-1?0:gapMs);return boundary;});
};

export class MacOsSayTtsAdapter implements VoiceProvider{
  readonly provider="macos-say";
  constructor(private readonly settings:MacOsSayVoiceSettings){}
  async synthesize(request:VoiceSynthesisRequest):Promise<VoiceSynthesisResult>{
    if(process.platform!=="darwin")throw new Error("macOS say 本地配音仅支持 Darwin");if(!ffmpegPath)throw new Error("ffmpeg-static 未提供可执行文件路径");
    const chunks=segmentChineseCaptionText(request.text);const chunkFiles:string[]=[];const chunkDurations:number[]=[];await unlink(request.audioPath).catch(()=>undefined);
    for(const [index,chunk] of chunks.entries()){
      const suffix=`.phrase-${String(index+1).padStart(2,"0")}`;const aiffPath=request.audioPath.replace(/\.mp3$/u,`${suffix}.aiff`);const mp3Path=request.audioPath.replace(/\.mp3$/u,`${suffix}.mp3`);await Promise.all([unlink(aiffPath).catch(()=>undefined),unlink(mp3Path).catch(()=>undefined)]);
      await run("say",buildMacOsSayArgs(this.settings,aiffPath,chunk),"macOS say");
      await run(ffmpegPath,["-y","-i",aiffPath,"-c:a","libmp3lame","-ar","24000","-ac","1","-b:a","64k",mp3Path],"local TTS phrase conversion");await unlink(aiffPath).catch(()=>undefined);
      const media=await inspectMediaFile(mp3Path);if(!media.canRead||media.audioTracks.length!==1||media.durationMs<=0)throw new Error(`macOS say 返回无效短语音频：${request.segmentId}/${index+1}`);chunkFiles.push(mp3Path);chunkDurations.push(media.durationMs);
    }
    await assembleVoiceTrack({segments:chunkFiles.map((path)=>({path,pauseAfterMs:PHRASE_GAP_MS})),outputPath:request.audioPath,leadInMs:0,tailOutMs:0});await Promise.all(chunkFiles.map((path)=>unlink(path).catch(()=>undefined)));
    const [media,fileStats]=await Promise.all([inspectMediaFile(request.audioPath),stat(request.audioPath)]);if(!media.canRead||media.audioTracks.length!==1||media.durationMs<=0||fileStats.size<512)throw new Error(`macOS say 返回无效音频：${request.segmentId}`);
    return {...request,durationMs:media.durationMs,boundaries:buildMacOsSayBoundaryPlan(request.text,chunkDurations)};
  }
}
