import {Easing, interpolate, useCurrentFrame} from "remotion";
import type {KnowledgeSceneProps} from "./SceneFrame";
import {SceneFrame} from "./SceneFrame";
import {knowledgeTheme} from "../theme";

export const HookScene = ({scene, logicalDurationInFrames}: KnowledgeSceneProps) => {
  const frame = Math.min(useCurrentFrame(), logicalDurationInFrames - 1);
  const [headline, supportingText] = scene.onScreenText;

  return (
    <SceneFrame
      accentColor={scene.presentation.accentColor}
      label="OPENING HOOK"
    >
      <div
        style={{
          color: scene.presentation.accentColor,
          fontSize: 38,
          fontWeight: 800,
          marginBottom: 36,
          opacity: interpolate(frame, [0, 8], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        KNOWLEDGE HOOK
      </div>
      <div
        style={{
          fontSize: knowledgeTheme.headlineSize,
          fontWeight: 900,
          letterSpacing: -5,
          lineHeight: 1.12,
          opacity: interpolate(frame, [2, 12], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [2, 12], [0.86, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
          transformOrigin: "left center",
        }}
      >
        {headline}
      </div>
      {supportingText ? (
        <div
          style={{
            color: knowledgeTheme.mutedText,
            fontSize: knowledgeTheme.supportingSize,
            fontWeight: 600,
            lineHeight: 1.5,
            marginTop: 48,
            opacity: interpolate(frame, [10, 22], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {supportingText}
        </div>
      ) : null}
    </SceneFrame>
  );
};
