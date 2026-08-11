import {Easing, interpolate, useCurrentFrame} from "remotion";
import type {KnowledgeSceneProps} from "./SceneFrame";
import {SceneFrame} from "./SceneFrame";
import {knowledgeTheme} from "../theme";

export const StatCardScene = ({
  scene,
  logicalDurationInFrames,
}: KnowledgeSceneProps) => {
  const frame = Math.min(useCurrentFrame(), logicalDurationInFrames - 1);
  if (scene.presentation.variant !== "stat-card") {
    throw new Error(`Scene ${scene.id} must use stat-card presentation`);
  }
  const [headline, supportingText] = scene.onScreenText;
  const {metric} = scene.presentation;

  return (
    <SceneFrame accentColor={scene.presentation.accentColor} label="THE FRAMEWORK">
      <div
        style={{
          alignItems: "center",
          backgroundColor: knowledgeTheme.panel,
          border: `3px solid ${scene.presentation.accentColor}77`,
          borderRadius: knowledgeTheme.radius,
          boxShadow: knowledgeTheme.shadow,
          display: "flex",
          flexDirection: "column",
          padding: "84px 56px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            alignItems: "baseline",
            display: "flex",
            gap: 20,
            opacity: interpolate(frame, [0, 12], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: interpolate(frame, [0, 14], [0.82, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
            }),
          }}
        >
          <span
            style={{
              color: scene.presentation.accentColor,
              fontSize: 250,
              fontWeight: 950,
              letterSpacing: -12,
              lineHeight: 0.9,
            }}
          >
            {metric.value}
          </span>
          <span style={{fontSize: 76, fontWeight: 850}}>{metric.unit}</span>
        </div>
        <div style={{fontSize: 52, fontWeight: 750, marginTop: 42}}>
          {metric.label}
        </div>
      </div>
      <div
        style={{
          fontSize: 74,
          fontWeight: 880,
          lineHeight: 1.2,
          marginTop: 64,
          opacity: interpolate(frame, [12, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {headline}
      </div>
      {supportingText ? (
        <div
          style={{
            color: knowledgeTheme.mutedText,
            fontSize: knowledgeTheme.supportingSize,
            lineHeight: 1.5,
            marginTop: 28,
          }}
        >
          {supportingText}
        </div>
      ) : null}
    </SceneFrame>
  );
};
