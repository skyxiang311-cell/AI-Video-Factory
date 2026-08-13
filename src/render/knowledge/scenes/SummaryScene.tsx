import {Easing, interpolate, useCurrentFrame} from "remotion";
import {Icon} from "../components/Icon";
import {SceneCanvas} from "../components/SceneCanvas";
import {resolveAccent, resolveCanvasColors} from "../visual-utils";
import type {VisualSceneProps} from "./types";

export const SummaryScene = ({branding, logicalDurationInFrames, scene, sceneCount, sceneIndex}: VisualSceneProps<"summary">) => {
  const frame = Math.min(useCurrentFrame(), logicalDurationInFrames - 1);
  const {accent, closing, items, title, tone} = scene.visualData;
  const accentColor = resolveAccent(accent);
  const colors = resolveCanvasColors(tone);

  return (
    <SceneCanvas accentColor={accentColor} branding={branding} sceneCount={sceneCount} sceneIndex={sceneIndex} sourceNote={scene.sourceNote} tone={tone}>
      <div style={{alignItems: "center", display: "flex", gap: 24, marginBottom: 42}}>
        <Icon color={accentColor} name="bookmark" size={58} />
        <div style={{fontSize: 72, fontWeight: 860, letterSpacing: -3}}>{title}</div>
      </div>
      <div style={{backgroundColor: colors.panel, border: `2px solid ${accentColor}66`, padding: "28px 42px"}}>
        {items.map((item, index) => {
          const reveal = interpolate(frame, [6 + index * 8, 18 + index * 8], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={`${item.label}-${index}`} style={{alignItems: "center", borderBottom: index === items.length - 1 ? "none" : `1px solid ${colors.foreground}18`, display: "grid", gap: 28, gridTemplateColumns: "66px 1fr", opacity: reveal, padding: "30px 0", translate: `${(1 - reveal) * 40}px 0px`}}>
              <div style={{alignItems: "center", backgroundColor: accentColor, borderRadius: 999, display: "flex", height: 58, justifyContent: "center", width: 58}}>
                <Icon color={colors.background} name={item.icon} size={30} strokeWidth={2.2} />
              </div>
              <div style={{fontSize: 48, fontWeight: 680}}>{item.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{color: accentColor, fontSize: 40, fontWeight: 700, marginTop: 44, opacity: interpolate(frame, [32, 48], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}}>{closing}</div>
    </SceneCanvas>
  );
};
