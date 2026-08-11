import {Easing, interpolate, useCurrentFrame} from "remotion";
import type {KnowledgeSceneProps} from "./SceneFrame";
import {SceneFrame} from "./SceneFrame";
import {knowledgeTheme} from "../theme";

export const KnowledgePointScene = ({
  scene,
  logicalDurationInFrames,
}: KnowledgeSceneProps) => {
  const frame = Math.min(useCurrentFrame(), logicalDurationInFrames - 1);
  if (scene.presentation.variant !== "knowledge-point") {
    throw new Error(`Scene ${scene.id} must use knowledge-point presentation`);
  }
  const [headline, supportingText] = scene.onScreenText;

  return (
    <SceneFrame accentColor={scene.presentation.accentColor} label="CORE KNOWLEDGE">
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 34,
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transform: `translateX(${interpolate(frame, [0, 10], [-60, 0], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px)`,
        }}
      >
        <div
          style={{
            alignItems: "center",
            backgroundColor: scene.presentation.accentColor,
            borderRadius: 999,
            color: knowledgeTheme.background,
            display: "flex",
            flexShrink: 0,
            fontSize: 64,
            fontWeight: 950,
            height: 118,
            justifyContent: "center",
            width: 118,
          }}
        >
          {scene.presentation.pointNumber}
        </div>
        <span style={{fontSize: 44, fontWeight: 750, letterSpacing: 2}}>
          KNOWLEDGE POINT
        </span>
      </div>
      <div
        style={{
          fontSize: knowledgeTheme.headlineSize,
          fontWeight: 900,
          letterSpacing: -4,
          lineHeight: 1.14,
          marginTop: 72,
          opacity: interpolate(frame, [8, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transform: `translateY(${interpolate(frame, [8, 20], [64, 0], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px)`,
        }}
      >
        {headline}
      </div>
      {supportingText ? (
        <div
          style={{
            backgroundColor: knowledgeTheme.panel,
            borderLeft: `8px solid ${scene.presentation.accentColor}`,
            borderRadius: `0 ${knowledgeTheme.radius}px ${knowledgeTheme.radius}px 0`,
            color: knowledgeTheme.mutedText,
            fontSize: knowledgeTheme.supportingSize,
            fontWeight: 580,
            lineHeight: 1.55,
            marginTop: 70,
            opacity: interpolate(frame, [18, 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            padding: "48px 44px",
          }}
        >
          {supportingText}
        </div>
      ) : null}
    </SceneFrame>
  );
};
