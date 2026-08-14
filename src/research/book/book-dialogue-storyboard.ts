import {z} from "zod";
import {BookSourceRefSchema} from "./common-schema";
import {DialogueCaptionSchema, DialogueEmotionSchema, DialoguePoseSchema, DialogueScriptSchema, DialogueSpeakerSchema, DialogueVisualIntentSchema} from "./book-dialogue-schema";

const DialogueCharacterStateSchema = z.object({name: z.string().min(1), crop: z.object({x:z.number().int(),y:z.number().int(),width:z.number().int().positive(),height:z.number().int().positive()}), treatment: z.string(), accessory: z.string()});

export const DialogueCharacterPackSchema = z.object({
  referenceImage: z.string().min(1), referenceSize: z.object({width:z.literal(1672),height:z.literal(941)}),
  characters: z.object({
    xiaoyuan: z.object({displayName:z.literal("小圆"),color:z.literal("#ef5d78"),states:z.array(DialogueCharacterStateSchema).length(11)}),
    douzai: z.object({displayName:z.literal("豆仔"),color:z.literal("#3168bd"),states:z.array(DialogueCharacterStateSchema).length(11)}),
  }),
});

const FramingSchema = z.enum(["xiaoyuan-closeup","douzai-closeup","douzai-reaction","two-shot","character-data","character-comparison","character-diagram","mini-theater","info-card","both-summary"]);
const DialogueShotSchema = z.object({
  id: z.string().regex(/^dialogue-shot-\d{3}$/), turnId: z.string().regex(/^dialogue-turn-\d{3}$/),
  startMs:z.number().int().nonnegative(),endMs:z.number().int().positive(),speaker:DialogueSpeakerSchema,
  framing:FramingSchema,characterScene:z.boolean(),infoCard:z.boolean(),emotion:DialogueEmotionSchema,characterPose:DialoguePoseSchema,
  visualIntent:DialogueVisualIntentSchema,shortBubble:z.string().max(14),claimIds:z.array(z.string()),sourceRefs:z.array(BookSourceRefSchema),
  visualBeats:z.array(z.object({atMs:z.number().int().nonnegative(),kind:z.enum(["cut","pose-change","reaction","diagram-change","caption-emphasis"])})).min(2).max(4),
});

export const ComicDialogueStoryboardSchema = z.object({
  schemaVersion:z.literal("1.0"),jobId:z.string(),format:z.object({width:z.literal(1080),height:z.literal(1920),fps:z.literal(30),durationMs:z.number().int().min(270000).max(330000)}),
  dialogueScriptSha256:z.string().regex(/^[a-f0-9]{64}$/),sourceLockSha256:z.string().regex(/^[a-f0-9]{64}$/),voiceFingerprint:z.string().regex(/^[a-f0-9]{64}$/),referenceImageSha256:z.string().regex(/^[a-f0-9]{64}$/),characterPack:DialogueCharacterPackSchema,
  audio:z.object({src:z.literal("dialogue-voice.mp3"),multiVoice:z.literal(true),sha256:z.string().regex(/^[a-f0-9]{64}$/),voices:z.object({xiaoyuan:z.string(),douzai:z.string(),narrator:z.string()})}),
  captions:z.array(DialogueCaptionSchema).min(45),shots:z.array(DialogueShotSchema).min(40).max(60),
  characterScenePercentage:z.number().min(70).max(100),infoCardPercentage:z.number().min(0).max(30),
});

export type ComicDialogueStoryboard = z.infer<typeof ComicDialogueStoryboardSchema>;
export type DialogueCharacterPack = z.infer<typeof DialogueCharacterPackSchema>;

const states = (names: string[], crops: Array<{x:number;y:number;width:number;height:number}>): DialogueCharacterPack["characters"]["xiaoyuan"]["states"] => names.map((name,index) => ({
  name,crop:crops[index % crops.length]!,treatment:["steady","talk","lean","bounce","serious","zoom","tilt","think","droop","stop","hero"][index]!,accessory:["","♪","➜","♥","!","✦","?","…","汗","STOP","★"][index]!,
}));

export const buildDialogueCharacterPack = (referenceImage: string): DialogueCharacterPack => DialogueCharacterPackSchema.parse({
  referenceImage,referenceSize:{width:1672,height:941},characters:{
    xiaoyuan:{displayName:"小圆",color:"#ef5d78",states:states(["neutral","talk","explain","point","happy","serious","surprised","thinking","facepalm","stop","summary"],[{x:20,y:95,width:300,height:720},{x:360,y:125,width:150,height:185},{x:360,y:365,width:150,height:175}])},
    douzai:{displayName:"豆仔",color:"#3168bd",states:states(["neutral","ask","skeptical","confused","shock","thinking","complain","realize","happy","embarrassed","question"],[{x:560,y:100,width:220,height:760},{x:790,y:145,width:140,height:160},{x:790,y:390,width:140,height:155}])},
  },
});

const framingFor = (turn: z.infer<typeof DialogueScriptSchema>["turns"][number]): z.infer<typeof FramingSchema> => {
  if (turn.visualIntent === "info_card") return "info-card";
  if (turn.visualIntent === "character_data") return "character-data";
  if (turn.visualIntent === "character_comparison") return "character-comparison";
  if (turn.visualIntent === "character_diagram") return "character-diagram";
  if (turn.visualIntent === "mini_theater") return "mini-theater";
  if (turn.visualIntent === "both_summary") return "both-summary";
  if (turn.speaker === "douzai") return turn.purpose === "challenge" || turn.purpose === "phase3c_challenge" ? "douzai-reaction" : "douzai-closeup";
  if (turn.speaker === "xiaoyuan") return "xiaoyuan-closeup";
  return "two-shot";
};

export const dialogueBubbleFor = (text: string): string => {
  const normalized = text.replace(/[，。！？；：、]/gu, "");
  return Array.from(normalized).slice(0, 10).join("") + (Array.from(normalized).length > 10 ? "…" : "");
};

export const buildComicDialogueStoryboard = (input:{jobId:string;timeline:unknown;referenceImage:string;referenceImageSha256?:string;audioSha256:string;dialogueScriptSha256:string;sourceLockSha256?:string;voiceFingerprint?:string;voices?:{xiaoyuan:string;douzai:string;narrator:string}}): ComicDialogueStoryboard => {
  const timeline = DialogueScriptSchema.parse(input.timeline);
  const shots: z.infer<typeof DialogueShotSchema>[] = [];
  for (const turn of timeline.turns) {
    const duration = turn.endMs-turn.startMs;
    const framing=framingFor(turn); const infoCard=framing==="info-card";const beatCount=Math.min(4,Math.max(2,Math.ceil(duration/5500)));const beatKinds=["cut",turn.speaker==="douzai"?"reaction":"pose-change","caption-emphasis","diagram-change"] as const;
    const visualBeats=Array.from({length:beatCount},(_,beat)=>({atMs:Math.round(beat*duration/beatCount),kind:beatKinds[beat]!}));
    shots.push({id:`dialogue-shot-${String(shots.length+1).padStart(3,"0")}`,turnId:turn.id,startMs:turn.startMs,endMs:turn.endMs,speaker:turn.speaker,framing,characterScene:!infoCard,infoCard,emotion:turn.emotion,characterPose:turn.characterPose,visualIntent:turn.visualIntent,shortBubble:dialogueBubbleFor(turn.text),claimIds:turn.claimIds,sourceRefs:turn.sourceRefs,visualBeats});
  }
  if(shots.length<40||shots.length>60) throw new Error(`visual shots 必须为 40–60，实际 ${shots.length}`);
  const characterScenePercentage=Math.round(shots.filter((shot)=>shot.characterScene).length/shots.length*1000)/10;
  const infoCardPercentage=Math.round(shots.filter((shot)=>shot.infoCard).length/shots.length*1000)/10;
  return ComicDialogueStoryboardSchema.parse({schemaVersion:"1.0",jobId:input.jobId,format:{width:1080,height:1920,fps:30,durationMs:timeline.durationMs},dialogueScriptSha256:input.dialogueScriptSha256,sourceLockSha256:input.sourceLockSha256??"3".repeat(64),voiceFingerprint:input.voiceFingerprint??"4".repeat(64),referenceImageSha256:input.referenceImageSha256??"2".repeat(64),characterPack:buildDialogueCharacterPack(input.referenceImage),audio:{src:"dialogue-voice.mp3",multiVoice:true,sha256:input.audioSha256,voices:input.voices??{xiaoyuan:"zh-CN-XiaoxiaoNeural",douzai:"zh-CN-YunxiNeural",narrator:"zh-CN-YunyangNeural"}},captions:timeline.captions,shots,characterScenePercentage,infoCardPercentage});
};
