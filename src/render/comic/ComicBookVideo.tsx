import {Audio} from "@remotion/media";
import {AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import type {BookComicStoryboard, ComicCharacterPack, ComicShot} from "../../research/book/comic-storyboard-schema";
import type {VisualCaption} from "../../storyboard/visual-schema";
import {layoutChineseCaption} from "../../storyboard/caption-layout";
import {resolveComicCharacterPoses, resolveComicVisualState} from "../../research/book/book-comic-timing";

const palette: Record<ComicShot["background"], {base: string; accent: string; pattern: string}> = {
  "knowledge-solid": {base: "#fff8ed", accent: "#ef5d78", pattern: "radial-gradient(#f6c75c 2px, transparent 2px)"},
  "living-room": {base: "#ffeccf", accent: "#e8953a", pattern: "linear-gradient(165deg,#ffeccf 70%,#d98d52 70%)"},
  "study-desk": {base: "#eef5ff", accent: "#3168bd", pattern: "linear-gradient(180deg,transparent 76%,#b77746 76%)"},
  city: {base: "#e8f4ff", accent: "#438fc8", pattern: "linear-gradient(90deg,transparent 12%,rgba(49,104,189,.12) 12% 28%,transparent 28% 45%,rgba(239,93,120,.12) 45% 64%,transparent 64%)"},
  "abstract-diagram": {base: "#f4eeff", accent: "#8758bb", pattern: "radial-gradient(circle at 20% 30%,rgba(239,93,120,.18) 0 12%,transparent 12%),radial-gradient(circle at 78% 55%,rgba(49,104,189,.18) 0 15%,transparent 15%)"},
  "data-explainer": {base: "#fffaf0", accent: "#2f9d82", pattern: "linear-gradient(rgba(49,104,189,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(49,104,189,.08) 1px,transparent 1px)"},
};

const Character = ({id, pose, pack, side}: {id: "xiaoyuan" | "douzai"; pose: string; pack: ComicCharacterPack; side: "left" | "right"}) => {
  const frame = useCurrentFrame();
  const character = pack.characters[id];
  const state = character.states.find((candidate) => candidate.name === pose) ?? character.states[0]!;
  const width = 410;
  const height = 710;
  const scale = Math.max(width / state.crop.width, height / state.crop.height);
  const bounce = Math.sin(frame / 8) * 4;
  const enter = interpolate(frame, [0, 12], [side === "left" ? -90 : 90, 0], {extrapolateRight: "clamp"});
  const treatment: Record<string, string> = {"lean-forward":"rotate(-2deg) scale(1.03)",tilt:"rotate(3deg)",zoom:"scale(1.08)","soft-bob":`translateY(${bounce * .5}px)`,"side-eye":"rotate(-4deg)",celebrate:"scale(1.06)",pulse:`scale(${1 + Math.sin(frame / 5) * .025})`,droop:"rotate(2deg) translateY(10px)",hero:"scale(1.05)"};
  const accessory: Record<string, string> = {none:"",sparkles:"✦", "question-mark":"?", "shock-lines":"!!", "thought-cloud":"☁", "sweat-drop":"◔", hearts:"♥", "impact-lines":"✹", ellipsis:"…", star:"★"};
  return <div style={{position: "absolute", left: side === "left" ? 38 : undefined, right: side === "right" ? 38 : undefined, bottom: 300, width, height, transform: `translateX(${enter}px) translateY(${bounce}px) ${treatment[state.treatment] ?? ""}`, overflow: "hidden", borderRadius: 48, filter: "drop-shadow(0 20px 18px rgba(40,38,45,.18))"}}>
    <Img src={staticFile(pack.referenceImage)} style={{position: "absolute", width: 1672 * scale, height: 941 * scale, left: (width - state.crop.width * scale) / 2 - state.crop.x * scale, top: (height - state.crop.height * scale) / 2 - state.crop.y * scale, transform: state.flip ? "scaleX(-1)" : undefined}} />
    {state.accessory !== "none" ? <div style={{position: "absolute", right: 12, top: 24, fontSize: 72, fontWeight: 900, color: character.color, textShadow: "0 4px 0 white"}}>{accessory[state.accessory]}</div> : null}
  </div>;
};

const Bubble = ({shot, activeTurn, accent}: {shot: ComicShot; activeTurn: number; accent: string}) => {
  const turn = shot.turns[activeTurn] ?? shot.turns[0]!;
  const isLeft = turn.speaker === "xiaoyuan";
  return <div style={{position: "absolute", top: 215, left: isLeft ? 70 : 210, width: 800, minHeight: 250, padding: "42px 50px", background: "white", border: "7px solid #252329", borderRadius: 54, boxShadow: `14px 14px 0 ${accent}`, fontSize: 49, lineHeight: 1.38, fontWeight: 800, color: "#252329"}}>
    <div style={{position: "absolute", top: -42, left: isLeft ? 28 : 570, padding: "9px 22px", borderRadius: 24, background: isLeft ? "#ef5d78" : turn.speaker === "douzai" ? "#3168bd" : "#58535f", color: "white", fontSize: 28}}>{turn.speaker === "xiaoyuan" ? "小圆" : turn.speaker === "douzai" ? "豆仔" : "旁白"}</div>
    {turn.text}
  </div>;
};

const Diagram = ({shot, accent, revealed, components}: {shot: ComicShot; accent: string; revealed: string[]; components: Set<string>}) => {
  const number = shot.turns.map((turn) => turn.text).join("").match(/\d+(?:\.\d+)?%?|\d+万/u)?.[0];
  const opacity = revealed.includes("diagram-draw") ? 1 : .28;
  return <div style={{position: "absolute", left: 110, right: 110, top: 575, height: 280, opacity}}>
    {number && components.has("number-tag") ? <div style={{position: "absolute", left: 310, top: 20, fontSize: 116, fontWeight: 1000, color: accent, WebkitTextStroke: "3px #252329", textShadow: "8px 8px 0 white"}}>{number}</div> : <>
      <div style={{position: "absolute", left: 70, top: 95, width: 210, height: 100, borderRadius: 32, background: "white", border: `6px solid ${accent}`, display: "grid", placeItems: "center", fontSize: 35, fontWeight: 900}}>证据</div>
      {components.has("arrow") ? <div style={{position: "absolute", left: 335, top: 125, fontSize: 72, color: accent, transform: `scaleX(${revealed.includes("diagram-draw") ? 1 : .5})`}}>➜</div> : null}
      <div style={{position: "absolute", right: 70, top: 95, width: 210, height: 100, borderRadius: 32, background: "white", border: `6px solid ${accent}`, display: "grid", placeItems: "center", fontSize: 35, fontWeight: 900}}>结论</div>
    </>}
    {components.has("mini-chart") ? <div style={{position:"absolute",left:20,bottom:0,display:"flex",alignItems:"flex-end",gap:8,height:70}}>{[26,44,62].map((height) => <div key={height} style={{width:18,height,background:accent,borderRadius:6}} />)}</div> : null}
  </div>;
};

const ComicShotView = ({shot, pack}: {shot: ComicShot; pack: ComicCharacterPack}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const absoluteMs = shot.startMs + frame / fps * 1000;
  const visualState = resolveComicVisualState({absoluteMs, shotStartMs: shot.startMs, turns: shot.turns, visualBeats: shot.visualBeats});
  const activeTurn = visualState.activeTurnIndex;
  const revealed = visualState.revealedBeatKinds;
  const components = new Set(pack.components);
  const theme = palette[shot.background];
  const poses = resolveComicCharacterPoses(shot.turns, activeTurn);
  return <AbsoluteFill style={{background: theme.base, backgroundImage: theme.pattern, backgroundSize: shot.background === "data-explainer" ? "64px 64px" : undefined, overflow: "hidden", fontFamily: "Noto Sans SC, sans-serif"}}>
    <div style={{position: "absolute", left: 42, top: 42, padding: "12px 24px", borderRadius: 30, color: "white", background: "#252329", fontSize: 26, fontWeight: 900}}>小圆 × 豆仔 · 趣味深读</div>
    <div style={{position: "absolute", right: 42, top: 43, fontSize: 27, fontWeight: 900, color: theme.accent}}>#{String(Number(shot.id.slice(-3))).padStart(2, "0")}</div>
    {components.has("speech-bubble") ? <Bubble shot={shot} activeTurn={activeTurn} accent={theme.accent} /> : null}
    <Diagram shot={shot} accent={theme.accent} revealed={revealed} components={components} />
    <Character id="xiaoyuan" pose={poses.xiaoyuan} pack={pack} side="left" />
    <Character id="douzai" pose={poses.douzai} pack={pack} side="right" />
    {components.has("keyword-sticker") && revealed.includes("keyword-pop") ? <div style={{position: "absolute", left: 160, right: 160, bottom: 230, textAlign: "center", color: "#252329", fontSize: 36, fontWeight: 1000, transform: "scale(1)"}}>✦ {shot.keyword} ✦</div> : null}
    {components.has("thought-bubble") && shot.turns[activeTurn]?.pose === "thinking" ? <div style={{position:"absolute",right:90,top:875,fontSize:55}}>☁ ···</div> : null}
    {components.has("emphasis-lines") && revealed.includes("bubble-swap") ? <div style={{position:"absolute",left:28,top:180,fontSize:58,color:theme.accent}}>／／／</div> : null}
    {components.has("icon-slot") ? <div style={{position:"absolute",right:38,top:110,fontSize:48,color:theme.accent}}>★</div> : null}
    {shot.sourceNote ? <div style={{position: "absolute", right: 42, bottom: 180, color: "#655e67", fontSize: 22}}>来源：{shot.sourceNote}</div> : null}
  </AbsoluteFill>;
};

const Caption = ({caption}: {caption: VisualCaption}) => <AbsoluteFill style={{justifyContent: "flex-end", alignItems: "center", paddingBottom: 70, pointerEvents: "none", fontFamily: "Noto Sans SC, sans-serif"}}>
  <div style={{maxWidth: 890, padding: "16px 26px 20px", background: "rgba(25,24,28,.9)", border: "4px solid white", borderRadius: 28, color: "white", fontSize: 46, fontWeight: 900, lineHeight: 1.25, textAlign: "center", boxShadow: "0 10px 0 rgba(0,0,0,.18)"}}>{layoutChineseCaption(caption.text).map((line) => <div key={line}>{line}</div>)}</div>
</AbsoluteFill>;

export const ComicBookVideo = (storyboard: BookComicStoryboard) => {
  const {fps} = useVideoConfig();
  return <AbsoluteFill style={{backgroundColor: "#fff8ed"}}>
    <Audio src={staticFile(storyboard.audio.src)} />
    {storyboard.shots.map((shot) => {
      const from = Math.round(shot.startMs / 1000 * fps);
      const duration = Math.max(1, Math.round(shot.endMs / 1000 * fps) - from);
      return <Sequence key={shot.id} from={from} durationInFrames={duration} premountFor={fps}><ComicShotView shot={shot} pack={storyboard.characterPack} /></Sequence>;
    })}
    {storyboard.captions.map((caption, index) => {
      const from = Math.round(caption.startMs / 1000 * fps);
      const duration = Math.max(1, Math.round(caption.endMs / 1000 * fps) - from);
      return <Sequence key={`${caption.startMs}-${index}`} from={from} durationInFrames={duration} layout="none"><Caption caption={caption as VisualCaption} /></Sequence>;
    })}
  </AbsoluteFill>;
};
