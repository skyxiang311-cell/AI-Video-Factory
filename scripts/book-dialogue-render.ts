import {bundle} from "@remotion/bundler";
import {renderMedia,selectComposition} from "@remotion/renderer";
import {createHash} from "node:crypto";
import {readFile,rename,unlink} from "node:fs/promises";
import {resolve} from "node:path";
import {DialogueScriptSchema} from "../src/research/book/book-dialogue-schema";
import {ComicDialogueStoryboardSchema} from "../src/research/book/book-dialogue-storyboard";
import {assertDialogueOutputContract,assertDialogueSourceLock,verifyDialogueComicOutput} from "../src/research/book/book-dialogue-verification";

const parseJobId=(argv:string[])=>{if(argv.length!==1||!argv[0]||!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0]))throw new Error("Usage: npm run book:dialogue-render -- <job-id>");return argv[0];};
const sha=(value:Buffer)=>createHash("sha256").update(value).digest("hex");
export const runBookDialogueRenderCli=async(argv=process.argv.slice(2)):Promise<void>=>{
  const jobId=parseJobId(argv);const directory=resolve("output",jobId);
  const [scriptText,storyboardText,voiceText,voiceBytes,referenceBytes,sourceLockText,lockedScript,expandedScript,selectedAngle,bookSynthesis]=await Promise.all([readFile(resolve(directory,"dialogue-script.json"),"utf8"),readFile(resolve(directory,"comic-dialogue-storyboard.json"),"utf8"),readFile(resolve(directory,"dialogue-voice.json"),"utf8"),readFile(resolve(directory,"dialogue-voice.mp3")),readFile(resolve(directory,"dialogue-assets/character-reference.png")),readFile(resolve(directory,"dialogue-source-lock.json"),"utf8"),readFile(resolve(directory,"script.json"),"utf8"),readFile(resolve(directory,"video-script.json"),"utf8"),readFile(resolve(directory,"book/selected-angle.json"),"utf8"),readFile(resolve(directory,"book/book-synthesis.json"),"utf8")]);
  const script=DialogueScriptSchema.parse(JSON.parse(scriptText));const storyboard=ComicDialogueStoryboardSchema.parse(JSON.parse(storyboardText));const voice=JSON.parse(voiceText);const sourceLock=JSON.parse(sourceLockText);assertDialogueSourceLock({lock:sourceLock,script:lockedScript,expandedScript,selectedAngle,bookSynthesis});if(storyboard.sourceLockSha256!==createHash("sha256").update(sourceLockText).digest("hex"))throw new Error("dialogue source lock artifact 不一致");assertDialogueOutputContract({script,scriptText,storyboard,voiceManifest:voice});
  if(sha(voiceBytes)!==storyboard.audio.sha256||sha(referenceBytes)!==storyboard.referenceImageSha256)throw new Error("dialogue voice/character assets 已变化");
  const serveUrl=await bundle({entryPoint:resolve("apps/studio/src/index.ts"),publicDir:directory});const composition=await selectComposition({serveUrl,id:"BookDialogueComic",inputProps:storyboard});const expectedFrames=Math.ceil(storyboard.format.durationMs/1000*30);if(composition.width!==1080||composition.height!==1920||composition.fps!==30||composition.durationInFrames!==expectedFrames)throw new Error("BookDialogueComic metadata 不一致");
  const temporary=resolve(directory,"final-dialogue-comic.tmp.mp4");const output=resolve(directory,"final-dialogue-comic.mp4");await unlink(temporary).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});await renderMedia({codec:"h264",audioCodec:"aac",pixelFormat:"yuv420p",composition,serveUrl,inputProps:storyboard,outputLocation:temporary});await rename(temporary,output);const result=await verifyDialogueComicOutput(jobId);
  console.log(JSON.stringify({jobId,durationMs:result.video.durationMs,dialogueTurns:result.script.turns.length,xiaoyuanTurns:result.script.quality.xiaoyuanTurns,douzaiTurns:result.script.quality.douzaiTurns,narratorTurns:result.script.quality.narratorTurns,visualShots:result.storyboard.shots.length,characterScenePercentage:result.storyboard.characterScenePercentage,infoCardPercentage:result.storyboard.infoCardPercentage,output}));
};
if(process.argv[1]&&resolve(process.argv[1])===resolve("scripts/book-dialogue-render.ts"))await runBookDialogueRenderCli();
