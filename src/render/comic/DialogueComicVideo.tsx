import {Audio} from "@remotion/media";
import {AbsoluteFill,Img,Sequence,interpolate,staticFile,useCurrentFrame,useVideoConfig} from "remotion";
import type {ComicDialogueStoryboard,DialogueCharacterPack} from "../../research/book/book-dialogue-storyboard";
import {resolveDialogueVisualState} from "../../research/book/book-dialogue-visual-timing";

type Shot=ComicDialogueStoryboard["shots"][number];
const themes=[{base:"#fff8ed",accent:"#ef5d78"},{base:"#edf5ff",accent:"#3168bd"},{base:"#fff0d8",accent:"#e99a32"},{base:"#f3efff",accent:"#8d62bd"},{base:"#eaf8f1",accent:"#2d9b7e"}];

const Character=({id,stateName,pack,large,side}:{id:"xiaoyuan"|"douzai";stateName:string;pack:DialogueCharacterPack;large:boolean;side:"left"|"right"})=>{
  const frame=useCurrentFrame();const character=pack.characters[id];const state=character.states.find((candidate)=>candidate.name===stateName)??character.states[0]!;
  const width=large?690:420;const height=large?980:680;const scale=Math.max(width/state.crop.width,height/state.crop.height);const entrance=interpolate(frame,[0,10],[side==="left"?-100:100,0],{extrapolateRight:"clamp"});
  const motion:Record<string,string>={talk:`translateY(${Math.sin(frame/4)*5}px)`,lean:"rotate(-2deg) scale(1.04)",bounce:`translateY(${Math.sin(frame/5)*10}px)`,serious:"scale(1.03)",zoom:"scale(1.08)",tilt:"rotate(3deg)",think:"rotate(-2deg)",droop:"translateY(18px) rotate(2deg)",stop:"scale(1.08)",hero:"scale(1.06)"};
  return <div style={{position:"absolute",bottom:large?250:330,left:side==="left"?large?60:45:undefined,right:side==="right"?large?60:45:undefined,width,height,overflow:"hidden",borderRadius:56,transform:`translateX(${entrance}px) ${motion[state.treatment]??""}`,filter:"drop-shadow(0 24px 18px rgba(30,28,32,.18))"}}>
    <Img src={staticFile(pack.referenceImage)} style={{position:"absolute",width:1672*scale,height:941*scale,left:(width-state.crop.width*scale)/2-state.crop.x*scale,top:(height-state.crop.height*scale)/2-state.crop.y*scale}}/>
    {state.accessory?<div style={{position:"absolute",top:24,right:24,fontSize:72,fontWeight:1000,color:character.color,textShadow:"0 4px white"}}>{state.accessory}</div>:null}
  </div>;
};

const KnowledgeVisual=({shot,accent,beatIndex,revealed}:{shot:Shot;accent:string;beatIndex:number;revealed:boolean})=>{
  const frame=useCurrentFrame();const pulse=1+Math.sin(frame/7)*.025;const number=shot.shortBubble.match(/\d+(?:\.\d+)?%?|\d+万/u)?.[0];
  if(shot.framing==="character-data"||shot.framing==="info-card")return <div style={{position:"absolute",top:340,left:120,right:120,height:500,border:"7px solid #252329",borderRadius:56,background:"white",display:"grid",placeItems:"center",boxShadow:`16px 16px 0 ${accent}`,opacity:revealed?1:.45}}><div style={{fontSize:number?150:70,fontWeight:1000,color:accent,transform:`scale(${pulse*(1+beatIndex*.035)})`}}>{number??shot.shortBubble}</div><div style={{position:"absolute",bottom:35,left:70,right:70,height:12,background:`linear-gradient(90deg,${accent} ${revealed?"88%":"45%"},#eee 0)`,borderRadius:8}}/></div>;
  if(shot.framing==="character-comparison")return <div style={{position:"absolute",top:365,left:80,right:80,display:"flex",gap:70,justifyContent:"center"}}>{["直觉","原文"].map((label,index)=><div key={label} style={{width:350,height:240,borderRadius:50,border:"7px solid #252329",background:index&&revealed?accent:"white",color:index&&revealed?"white":"#252329",display:"grid",placeItems:"center",fontSize:56,fontWeight:1000,transform:`translateY(${index&&revealed?-18:0}px)`}}>{label}</div>)}</div>;
  if(shot.framing==="character-diagram")return <div style={{position:"absolute",top:410,left:150,right:150,display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:58,fontWeight:1000}}><span>观察</span><span style={{color:accent,fontSize:100,opacity:revealed?1:.25,transform:`scaleX(${revealed?1:.45})`}}>➜</span><span style={{opacity:revealed?1:.35}}>判断</span></div>;
  if(shot.framing==="mini-theater")return <div style={{position:"absolute",top:360,left:130,right:130,textAlign:"center",fontSize:120}}>🏠　💼　🏙️</div>;
  return null;
};

const ShotView=({shot,storyboard,index}:{shot:Shot;storyboard:ComicDialogueStoryboard;index:number})=>{
  const frame=useCurrentFrame();const {fps}=useVideoConfig();const visual=resolveDialogueVisualState({...shot,localMs:frame/fps*1000});const theme=themes[index%themes.length]!;const xSpeaking=shot.speaker==="xiaoyuan";const dSpeaking=shot.speaker==="douzai";const two=["two-shot","character-data","character-comparison","character-diagram","mini-theater","both-summary"].includes(shot.framing);
  return <AbsoluteFill style={{background:theme.base,backgroundImage:"radial-gradient(rgba(38,35,41,.08) 2px,transparent 2px)",backgroundSize:"48px 48px",fontFamily:"Noto Sans SC,sans-serif",overflow:"hidden"}}>
    <div style={{position:"absolute",top:48,left:44,padding:"12px 24px",borderRadius:28,background:"#252329",color:"white",fontSize:26,fontWeight:900}}>小圆 ↔ 豆仔 · 真对话深读</div>
    <div style={{position:"absolute",top:50,right:45,color:theme.accent,fontSize:28,fontWeight:1000}}>CUT {String(index+1).padStart(2,"0")}</div>
    <KnowledgeVisual shot={shot} accent={theme.accent} beatIndex={visual.activeBeatIndex} revealed={visual.diagramReveal}/>
    {xSpeaking||two||shot.speaker==="narrator"?<Character id="xiaoyuan" stateName={xSpeaking?visual.characterPose:"thinking"} pack={storyboard.characterPack} large={xSpeaking&&!two} side="left"/>:null}
    {dSpeaking||two||shot.speaker==="narrator"?<Character id="douzai" stateName={dSpeaking?visual.characterPose:"thinking"} pack={storyboard.characterPack} large={dSpeaking&&!two} side="right"/>:null}
    <div style={{position:"absolute",top:shot.framing==="info-card"?890:220,left:xSpeaking?80:undefined,right:dSpeaking?80:undefined,maxWidth:620,padding:"24px 34px",border:`${visual.emphasis?9:6}px solid #252329`,borderRadius:42,background:"white",boxShadow:`12px 12px 0 ${xSpeaking?"#ef5d78":dSpeaking?"#3168bd":theme.accent}`,fontSize:48,fontWeight:1000,color:"#252329",transform:`scale(${visual.bubbleScale})`}}>{shot.shortBubble}</div>
  </AbsoluteFill>;
};

const SpeakerCaption=({caption}:{caption:ComicDialogueStoryboard["captions"][number]})=>{
  const color=caption.speaker==="xiaoyuan"?"#ef5d78":caption.speaker==="douzai"?"#3168bd":"#625b68";const name=caption.speaker==="xiaoyuan"?"小圆":caption.speaker==="douzai"?"豆仔":"旁白";
  return <AbsoluteFill style={{justifyContent:"flex-end",alignItems:"center",paddingBottom:72,fontFamily:"Noto Sans SC,sans-serif",pointerEvents:"none"}}><div style={{position:"relative",maxWidth:900,padding:"22px 30px 22px",borderRadius:28,border:"4px solid white",background:"rgba(28,27,31,.93)",color:"white",fontSize:45,fontWeight:900,lineHeight:1.3,textAlign:"center",boxShadow:"0 10px 0 rgba(0,0,0,.2)"}}><span style={{display:"inline-block",marginRight:16,padding:"5px 16px",borderRadius:18,background:color,fontSize:27,verticalAlign:"middle"}}>{name}</span>{caption.text}</div></AbsoluteFill>;
};

export const DialogueComicVideo=(storyboard:ComicDialogueStoryboard)=>{const {fps}=useVideoConfig();return <AbsoluteFill><Audio src={staticFile(storyboard.audio.src)}/>{storyboard.shots.map((shot,index)=>{const from=Math.round(shot.startMs/1000*fps);const duration=Math.max(1,Math.round(shot.endMs/1000*fps)-from);return <Sequence key={shot.id} from={from} durationInFrames={duration} premountFor={fps}><ShotView shot={shot} storyboard={storyboard} index={index}/></Sequence>;})}{storyboard.captions.map((caption,index)=>{const from=Math.round(caption.startMs/1000*fps);const duration=Math.max(1,Math.round(caption.endMs/1000*fps)-from);return <Sequence key={`${caption.turnId}-${index}`} from={from} durationInFrames={duration} layout="none"><SpeakerCaption caption={caption}/></Sequence>;})}</AbsoluteFill>;};
