import {Easing, interpolate, useCurrentFrame} from "remotion";
import {Icon} from "../components/Icon";
import {SceneCanvas} from "../components/SceneCanvas";
import {resolveAccent, resolveCanvasColors} from "../visual-utils";
import type {VisualSceneProps} from "./types";

export const ComparisonScene = ({branding, logicalDurationInFrames, scene, sceneCount, sceneIndex}: VisualSceneProps<"comparison">) => {
  const frame = Math.min(useCurrentFrame(), logicalDurationInFrames - 1);
  const {accent, left, mode, right, title, tone} = scene.visualData;
  const accentColor = resolveAccent(accent);
  const colors = resolveCanvasColors(tone);
  const sides = [left, right] as const;

  return (
    <SceneCanvas accentColor={accentColor} branding={branding} sceneCount={sceneCount} sceneIndex={sceneIndex} sourceNote={scene.sourceNote} tone={tone}>
      <div style={{fontSize: 64, fontWeight: 850, letterSpacing: -3, marginBottom: 50}}>{title}</div>
      <div style={{display: "grid", gap: 20, gridTemplateColumns: "1fr 1fr", position: "relative"}}>
        {sides.map((side, index) => {
          const reveal = interpolate(frame, [4 + index * 8, 20 + index * 8], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const sideColor = index === 1 ? accentColor : colors.muted;
          return (
            <div key={`${side.label}-${index}`} style={{backgroundColor: colors.panel, borderTop: `6px solid ${sideColor}`, minHeight: 620, opacity: reveal, padding: "42px 34px", translate: `${index === 0 ? (1 - reveal) * -54 : (1 - reveal) * 54}px 0px`}}>
              <div style={{alignItems: "center", display: "flex", justifyContent: "space-between"}}>
                <div style={{color: sideColor, fontSize: 26, fontWeight: 800, letterSpacing: 3}}>{side.label}</div>
                <Icon color={sideColor} name={side.icon} size={48} />
              </div>
              <div style={{fontSize: 62, fontWeight: 860, letterSpacing: -3, lineHeight: 1.15, marginTop: 54}}>{side.headline}</div>
              <div style={{display: "flex", flexDirection: "column", gap: 24, marginTop: 50}}>
                {side.points.map((point, pointIndex) => (
                  <div key={point} style={{alignItems: "flex-start", color: colors.muted, display: "grid", fontSize: 30, gap: 15, gridTemplateColumns: "28px 1fr", lineHeight: 1.45}}>
                    <span style={{color: sideColor}}>{mode === "wrong-right" ? (index === 0 ? "×" : "✓") : `${pointIndex + 1}`}</span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{alignItems: "center", backgroundColor: colors.background, border: `2px solid ${accentColor}`, borderRadius: 999, color: accentColor, display: "flex", fontSize: 28, fontWeight: 900, height: 70, justifyContent: "center", left: "50%", position: "absolute", top: 230, translate: "-50% 0px", width: 70}}>VS</div>
      </div>
    </SceneCanvas>
  );
};
