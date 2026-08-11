import {Easing, interpolate, useCurrentFrame} from "remotion";
import {getSceneProgress} from "../visual-utils";

type ProgressIndicatorProps = {
  accentColor: string;
  foregroundColor: string;
  sceneIndex: number;
  sceneCount: number;
};

export const ProgressIndicator = ({
  accentColor,
  foregroundColor,
  sceneIndex,
  sceneCount,
}: ProgressIndicatorProps) => {
  const frame = useCurrentFrame();
  const progress = getSceneProgress(sceneIndex, sceneCount);

  return (
    <div style={{alignItems: "center", display: "flex", gap: 24}}>
      <div
        style={{
          backgroundColor: `${foregroundColor}22`,
          height: 4,
          overflow: "hidden",
          width: 220,
        }}
      >
        <div
          style={{
            backgroundColor: accentColor,
            height: "100%",
            width: `${progress * interpolate(frame, [0, 12], [0, 100], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}%`,
          }}
        />
      </div>
      <div style={{display: "flex", gap: 8}}>
        {Array.from({length: sceneCount}, (_, index) => (
          <div
            key={index}
            style={{
              backgroundColor: index <= sceneIndex ? accentColor : `${foregroundColor}2f`,
              borderRadius: 999,
              height: 7,
              width: index === sceneIndex ? 24 : 7,
            }}
          />
        ))}
      </div>
    </div>
  );
};
