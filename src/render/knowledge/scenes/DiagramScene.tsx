import {Easing, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {buildMeaningfulBeatFrames} from "../visual-beats";
import {Icon} from "../components/Icon";
import {SceneCanvas} from "../components/SceneCanvas";
import {resolveAccent, resolveCanvasColors} from "../visual-utils";
import {buildDiagramLayout} from "./diagram-layout";
import type {VisualSceneProps} from "./types";

export const DiagramScene = ({branding, logicalDurationInFrames, scene, sceneCount, sceneIndex}: VisualSceneProps<"diagram">) => {
  const frame = Math.min(useCurrentFrame(), logicalDurationInFrames - 1);
  const {fps} = useVideoConfig();
  const beats = buildMeaningfulBeatFrames(logicalDurationInFrames, fps, 4);
  const {accent, edges, layout, nodes, title, tone} = scene.visualData;
  const accentColor = resolveAccent(accent);
  const colors = resolveCanvasColors(tone);
  const positions = buildDiagramLayout(layout, nodes.length);
  const nodeById = new Map(nodes.map((node, index) => [node.id, positions[index]!]));

  return (
    <SceneCanvas accentColor={accentColor} branding={branding} sceneCount={sceneCount} sceneIndex={sceneIndex} sourceNote={scene.sourceNote} tone={tone}>
      <div style={{fontSize: 66, fontWeight: 850, letterSpacing: -3, lineHeight: 1.2}}>{title}</div>
      <div style={{height: 780, marginTop: 38, position: "relative"}}>
        <svg height="100%" style={{left: 0, overflow: "visible", position: "absolute", top: 0}} viewBox="0 0 100 100" width="100%" preserveAspectRatio="none">
          {edges.map((edge, index) => {
            const from = nodeById.get(edge.from)!;
            const to = nodeById.get(edge.to)!;
            const revealAt = beats[Math.min(index + 2, beats.length - 1)]!;
            const progress = interpolate(frame, [revealAt - 6, revealAt + 10], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <line key={`${edge.from}-${edge.to}`} pathLength={1} stroke={accentColor} strokeDasharray="1" strokeDashoffset={1 - progress} strokeWidth={0.45} x1={from.x * 100} x2={to.x * 100} y1={from.y * 100} y2={to.y * 100} />
            );
          })}
        </svg>
        {nodes.map((node, index) => {
          const position = positions[index]!;
          const revealAt = beats[Math.min(index + 1, beats.length - 1)]!;
          const reveal = interpolate(frame, [revealAt - 6, revealAt + 8], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={node.id} style={{left: `${position.x * 100}%`, position: "absolute", top: `${position.y * 100}%`, translate: "-50% -50%"}}>
              <div style={{alignItems: "center", backgroundColor: colors.panel, border: `2px solid ${accentColor}66`, display: "flex", flexDirection: "column", height: layout === "horizontal-flow" ? 210 : 174, justifyContent: "center", opacity: reveal, padding: "22px 20px", scale: interpolate(reveal, [0, 1], [0.88, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale"}), textAlign: "center", width: layout === "horizontal-flow" ? 236 : 310}}>
                <Icon color={accentColor} name={node.icon} size={42} />
                <div style={{fontSize: 34, fontWeight: 760, lineHeight: 1.25, marginTop: 16}}>{node.label}</div>
                {node.detail ? <div style={{color: colors.muted, fontSize: 23, marginTop: 8}}>{node.detail}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </SceneCanvas>
  );
};
