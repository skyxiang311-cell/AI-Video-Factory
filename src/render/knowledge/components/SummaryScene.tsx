import {Easing, interpolate, useCurrentFrame} from "remotion";
import type {KnowledgeSceneProps} from "./SceneFrame";
import {SceneFrame} from "./SceneFrame";
import {knowledgeTheme} from "../theme";

export const SummaryScene = ({
  scene,
  logicalDurationInFrames,
}: KnowledgeSceneProps) => {
  const frame = Math.min(useCurrentFrame(), logicalDurationInFrames - 1);
  const [headline, ...supportingLines] = scene.onScreenText;

  return (
    <SceneFrame accentColor={scene.presentation.accentColor} label="SAVE THIS">
      <div
        style={{
          backgroundColor: knowledgeTheme.panelStrong,
          border: `3px solid ${scene.presentation.accentColor}`,
          borderRadius: knowledgeTheme.radius,
          boxShadow: knowledgeTheme.shadow,
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          padding: "84px 58px",
          scale: interpolate(frame, [0, 14], [0.9, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: scene.presentation.accentColor,
            fontSize: 90,
            fontWeight: 950,
            letterSpacing: -3,
            lineHeight: 1.25,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 26,
            marginTop: 64,
          }}
        >
          {supportingLines.map((line) => (
            <div
              key={line}
              style={{
                color: knowledgeTheme.text,
                fontSize: knowledgeTheme.supportingSize,
                fontWeight: 650,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </SceneFrame>
  );
};
