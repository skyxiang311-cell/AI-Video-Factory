import {Easing, interpolate, useCurrentFrame} from "remotion";
import {SceneCanvas} from "../components/SceneCanvas";
import {resolveAccent, resolveCanvasColors} from "../visual-utils";
import type {VisualSceneProps} from "./types";

export const HookScene = ({
  branding,
  logicalDurationInFrames,
  scene,
  sceneCount,
  sceneIndex,
}: VisualSceneProps<"hook">) => {
  const frame = Math.min(useCurrentFrame(), logicalDurationInFrames - 1);
  const {accent, headline, highlight, motif, supporting, tone} = scene.visualData;
  const accentColor = resolveAccent(accent);
  const colors = resolveCanvasColors(tone);
  const highlightIndex = headline.indexOf(highlight);

  return (
    <SceneCanvas
      accentColor={accentColor}
      branding={branding}
      sceneCount={sceneCount}
      sceneIndex={sceneIndex}
      tone={tone}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 18,
          marginBottom: 58,
          opacity: interpolate(frame, [0, 9], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{backgroundColor: accentColor, height: 10, width: 86}} />
        <div
          style={{
            border: `1px solid ${accentColor}77`,
            borderRadius: 999,
            color: accentColor,
            fontSize: 24,
            fontWeight: 760,
            letterSpacing: 4,
            padding: "10px 18px",
          }}
        >
          {motif === "question" ? "?" : motif === "contrast" ? "≠" : "→"}
        </div>
      </div>
      <div
        style={{
          fontSize: 132,
          fontWeight: 920,
          letterSpacing: -7,
          lineHeight: 1.08,
          opacity: interpolate(frame, [2, 15], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [2, 15], [0.88, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
          transformOrigin: "left center",
        }}
      >
        {highlightIndex < 0 ? headline : (
          <>
            {headline.slice(0, highlightIndex)}
            <span style={{color: accentColor}}>{highlight}</span>
            {headline.slice(highlightIndex + highlight.length)}
          </>
        )}
      </div>
      {supporting ? (
        <div
          style={{
            borderLeft: `4px solid ${accentColor}`,
            color: colors.muted,
            fontSize: 46,
            fontWeight: 560,
            lineHeight: 1.55,
            marginTop: 70,
            opacity: interpolate(frame, [12, 25], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            paddingLeft: 32,
            width: 760,
          }}
        >
          {supporting}
        </div>
      ) : null}
    </SceneCanvas>
  );
};
