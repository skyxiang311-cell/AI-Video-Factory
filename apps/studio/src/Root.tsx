import type {CalculateMetadataFunction} from "remotion";
import {Composition} from "remotion";
import {VisualKnowledgeVideo} from "../../../src/render/knowledge/VisualKnowledgeVideo";
import {sampleStoryboard} from "../../../src/storyboard/sample";
import {
  parseVisualStoryboard,
  VisualStoryboardPropsSchema,
  type VisualStoryboard,
} from "../../../src/storyboard/visual-schema";
import {buildVisualTimeline} from "../../../src/storyboard/visual-timeline";
import {ComicBookVideo} from "../../../src/render/comic/ComicBookVideo";
import {buildDefaultComicCharacterPack} from "../../../src/research/book/book-comic-storyboard";
import {BookComicStoryboardSchema, type BookComicStoryboard} from "../../../src/research/book/comic-storyboard-schema";
import {DialogueComicVideo} from "../../../src/render/comic/DialogueComicVideo";
import {buildDialogueCharacterPack,ComicDialogueStoryboardSchema,type ComicDialogueStoryboard} from "../../../src/research/book/book-dialogue-storyboard";

export const calculateKnowledgeMetadata: CalculateMetadataFunction<VisualStoryboard> = ({
  props,
}) => {
  const storyboard = parseVisualStoryboard(props);
  const timeline = buildVisualTimeline(storyboard);

  return {
    width: storyboard.format.width,
    height: storyboard.format.height,
    fps: storyboard.format.fps,
    durationInFrames: timeline.durationInFrames,
    props: storyboard,
    defaultOutName: storyboard.jobId,
  };
};

const defaultComicProps: BookComicStoryboard = BookComicStoryboardSchema.parse({
  schemaVersion: "1.0", jobId: "comic-preview",
  format: {width: 1080, height: 1920, fps: 30, durationMs: 300000},
  lockedScriptSha256: "0".repeat(64),
  sourceStoryboardSha256: "1".repeat(64), referenceImageSha256: "2".repeat(64), captionsSha256: "3".repeat(64),
  characterPack: buildDefaultComicCharacterPack("comic-scenes/character-reference.png"),
  audio: {reused: true, src: "voice.mp3", fingerprint: "4".repeat(64), durationMs: 300000, sha256: "5".repeat(64)}, captions: [],
  shots: Array.from({length: 40}, (_, index) => ({
    id: `comic-shot-${String(index + 1).padStart(3, "0")}`,
    startMs: index * 7500, endMs: (index + 1) * 7500,
    shotType: index % 2 ? "xiaoyuan-explains" : "two-person-dialogue",
    background: ["knowledge-solid", "living-room", "study-desk", "city", "abstract-diagram", "data-explainer"][index % 6],
    turns: [{speaker: index % 2 ? "xiaoyuan" : "douzai", text: "漫画解说预览", pose: index % 2 ? "explain" : "question", sourceSceneId: `preview-${index}`, startMs: index * 7500, endMs: (index + 1) * 7500}],
    claimIds: [], sourceRefs: [], keyword: "漫画解说",
    visualBeats: [{atMs:0,kind:"character-enter"},{atMs:2500,kind:"bubble-swap"},{atMs:5000,kind:"keyword-pop"}],
    originalSceneIds: [`preview-${index}`],
  })),
});

export const calculateComicMetadata: CalculateMetadataFunction<BookComicStoryboard> = ({props}) => {
  const storyboard = BookComicStoryboardSchema.parse(props);
  return {width: 1080, height: 1920, fps: 30, durationInFrames: Math.ceil(storyboard.format.durationMs / 1000 * 30), props: storyboard, defaultOutName: `${storyboard.jobId}-comic`};
};

const defaultDialogueProps:ComicDialogueStoryboard=ComicDialogueStoryboardSchema.parse({schemaVersion:"1.0",jobId:"dialogue-preview",format:{width:1080,height:1920,fps:30,durationMs:270000},dialogueScriptSha256:"0".repeat(64),sourceLockSha256:"3".repeat(64),voiceFingerprint:"4".repeat(64),referenceImageSha256:"2".repeat(64),characterPack:buildDialogueCharacterPack("dialogue-assets/character-reference.png"),audio:{src:"dialogue-voice.mp3",multiVoice:true,sha256:"1".repeat(64),voices:{xiaoyuan:"Flo (中文（中国大陆）)",douzai:"Eddy (中文（中国大陆）)",narrator:"Reed (中文（中国大陆）)"}},captions:Array.from({length:45},(_,index)=>({turnId:`dialogue-turn-${String(index+1).padStart(3,"0")}`,speaker:index%2?"xiaoyuan":"douzai",text:"真对话漫画预览",startMs:index*6000,endMs:index*6000+5600,timestampMs:index*6000,confidence:null})),shots:Array.from({length:45},(_,index)=>({id:`dialogue-shot-${String(index+1).padStart(3,"0")}`,turnId:`dialogue-turn-${String(index+1).padStart(3,"0")}`,startMs:index*6000,endMs:(index+1)*6000,speaker:index%2?"xiaoyuan":"douzai",framing:index%2?"xiaoyuan-closeup":"douzai-reaction",characterScene:true,infoCard:false,emotion:"curious",characterPose:index%2?"explain":"ask",visualIntent:index%2?"xiaoyuan_closeup":"douzai_reaction",shortBubble:"真对话",claimIds:[],sourceRefs:[],visualBeats:[{atMs:0,kind:"cut"},{atMs:3500,kind:"reaction"}]})),characterScenePercentage:100,infoCardPercentage:0});
export const calculateDialogueMetadata:CalculateMetadataFunction<ComicDialogueStoryboard>=({props})=>{const storyboard=ComicDialogueStoryboardSchema.parse(props);return{width:1080,height:1920,fps:30,durationInFrames:Math.ceil(storyboard.format.durationMs/1000*30),props:storyboard,defaultOutName:`${storyboard.jobId}-dialogue-comic`};};

export const RemotionRoot = () => (
  <>
    <Composition
      id="KnowledgeDemo"
      component={VisualKnowledgeVideo}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={900}
      defaultProps={sampleStoryboard}
      schema={VisualStoryboardPropsSchema}
      calculateMetadata={calculateKnowledgeMetadata}
    />
    <Composition
      id="BookDeepReading"
      component={VisualKnowledgeVideo}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={9000}
      defaultProps={sampleStoryboard}
      schema={VisualStoryboardPropsSchema}
      calculateMetadata={calculateKnowledgeMetadata}
    />
    <Composition
      id="BookComicExplainer"
      component={ComicBookVideo}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={9000}
      defaultProps={defaultComicProps}
      schema={BookComicStoryboardSchema}
      calculateMetadata={calculateComicMetadata}
    />
    <Composition id="BookDialogueComic" component={DialogueComicVideo} width={1080} height={1920} fps={30} durationInFrames={8100} defaultProps={defaultDialogueProps} schema={ComicDialogueStoryboardSchema} calculateMetadata={calculateDialogueMetadata}/>
  </>
);
