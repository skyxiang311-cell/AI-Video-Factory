import {createHash} from "node:crypto";
import {copyFile,mkdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {DialogueScriptSchema} from "../src/research/book/book-dialogue-schema";
import {buildComicDialogueStoryboard} from "../src/research/book/book-dialogue-storyboard";
import {assertDialogueOutputContract,assertDialogueSourceLock} from "../src/research/book/book-dialogue-verification";
import {atomicWriteJson} from "../src/shared/atomic-write";

const parseJobId=(argv:string[])=>{if(argv.length!==1||!argv[0]||!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0]))throw new Error("Usage: npm run book:dialogue-storyboard -- <job-id>");return argv[0];};
const sha=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
export const runBookDialogueStoryboardCli=async(argv=process.argv.slice(2)):Promise<void>=>{
  const jobId=parseJobId(argv);const directory=resolve("output",jobId);const referenceSource=resolve("assets/book-comic/xiaoyuan-douzai-reference.png");
  const [scriptText,voiceText,voiceBytes,referenceBytes,subtitlesText,sourceLockText,lockedScript,expandedScript,selectedAngle,bookSynthesis]=await Promise.all([readFile(resolve(directory,"dialogue-script.json"),"utf8"),readFile(resolve(directory,"dialogue-voice.json"),"utf8"),readFile(resolve(directory,"dialogue-voice.mp3")),readFile(referenceSource),readFile(resolve(directory,"dialogue-subtitles.json"),"utf8"),readFile(resolve(directory,"dialogue-source-lock.json"),"utf8"),readFile(resolve(directory,"script.json"),"utf8"),readFile(resolve(directory,"video-script.json"),"utf8"),readFile(resolve(directory,"book/selected-angle.json"),"utf8"),readFile(resolve(directory,"book/book-synthesis.json"),"utf8")]);
  const script=DialogueScriptSchema.parse(JSON.parse(scriptText));const voice=JSON.parse(voiceText);const subtitles=JSON.parse(subtitlesText);const sourceLock=JSON.parse(sourceLockText);assertDialogueSourceLock({lock:sourceLock,script:lockedScript,expandedScript,selectedAngle,bookSynthesis});
  if(JSON.stringify(subtitles.captions)!==JSON.stringify(script.captions))throw new Error("dialogue-subtitles 与 script 不一致");
  const assetsDirectory=resolve(directory,"dialogue-assets");const scenesDirectory=resolve(directory,"dialogue-scenes");await Promise.all([mkdir(assetsDirectory,{recursive:true}),mkdir(scenesDirectory,{recursive:true})]);await copyFile(referenceSource,resolve(assetsDirectory,"character-reference.png"));
  const storyboard=buildComicDialogueStoryboard({jobId,timeline:script,referenceImage:"dialogue-assets/character-reference.png",referenceImageSha256:sha(referenceBytes),audioSha256:sha(voiceBytes),dialogueScriptSha256:sha(scriptText),sourceLockSha256:sha(sourceLockText),voiceFingerprint:voice.fingerprint,voices:{xiaoyuan:voice.voices.xiaoyuan.voice,douzai:voice.voices.douzai.voice,narrator:voice.voices.narrator.voice}});
  assertDialogueOutputContract({script,scriptText,storyboard,voiceManifest:voice});
  await Promise.all([atomicWriteJson(resolve(directory,"comic-dialogue-storyboard.json"),storyboard),atomicWriteJson(resolve(directory,"dialogue-character-pack.json"),storyboard.characterPack),...storyboard.shots.map((shot)=>atomicWriteJson(resolve(scenesDirectory,`${shot.id}.json`),shot))]);
  console.log(JSON.stringify({jobId,durationMs:storyboard.format.durationMs,dialogueTurns:script.turns.length,visualShots:storyboard.shots.length,characterScenePercentage:storyboard.characterScenePercentage,infoCardPercentage:storyboard.infoCardPercentage}));
};
if(process.argv[1]&&resolve(process.argv[1])===resolve("scripts/book-dialogue-storyboard.ts"))await runBookDialogueStoryboardCli();
