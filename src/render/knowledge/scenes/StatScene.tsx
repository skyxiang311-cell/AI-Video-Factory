import {Easing, interpolate, useCurrentFrame} from "remotion";
import {Icon} from "../components/Icon";
import {SceneCanvas} from "../components/SceneCanvas";
import {resolveAccent, resolveCanvasColors} from "../visual-utils";
import {fitMetricFontSize, formatMetricValue} from "./stat-format";
import type {VisualSceneProps} from "./types";

export const StatScene = ({
  branding,
  logicalDurationInFrames,
  scene,
  sceneCount,
  sceneIndex,
}: VisualSceneProps<"stat">) => {
  const frame = Math.min(useCurrentFrame(), logicalDurationInFrames - 1);
  const {accent, metrics, mode, title, tone} = scene.visualData;
  const accentColor = resolveAccent(accent);
  const colors = resolveCanvasColors(tone);

  return (
    <SceneCanvas accentColor={accentColor} branding={branding} sceneCount={sceneCount} sceneIndex={sceneIndex} sourceNote={scene.sourceNote} tone={tone}>
      <div style={{fontSize: 44, fontWeight: 650, letterSpacing: 1, marginBottom: 48}}>{title}</div>
      <div
        style={{
          display: "grid",
          gap: 22,
          gridTemplateColumns: mode === "single" ? "1fr" : `repeat(${metrics.length}, 1fr)`,
        }}
      >
        {metrics.map((metric, index) => {
          const progress = interpolate(frame, [6 + index * 6, 34 + index * 6], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const displayValue = formatMetricValue(metric.value, progress, metric.decimals, metric.prefix, metric.suffix);
          return (
            <div
              key={`${metric.label}-${index}`}
              style={{
                backgroundColor: colors.panel,
                borderTop: `5px solid ${accentColor}`,
                minHeight: mode === "single" ? 530 : 470,
                opacity: progress,
                padding: mode === "single" ? "78px 64px" : "58px 38px",
                scale: interpolate(progress, [0, 1], [0.94, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  output: "perceptual-scale",
                }),
              }}
            >
              {metric.icon ? <Icon color={accentColor} name={metric.icon} size={54} /> : null}
              <div
                style={{
                  color: accentColor,
                  fontSize: mode === "single" ? fitMetricFontSize(displayValue, 720, 220) : 112,
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 920,
                  letterSpacing: -8,
                  lineHeight: 1,
                  marginTop: metric.icon ? 42 : 0,
                  whiteSpace: "nowrap",
                }}
              >
                {displayValue}
              </div>
              <div style={{fontSize: 38, fontWeight: 620, lineHeight: 1.4, marginTop: 48}}>{metric.label}</div>
              {metric.progress !== undefined ? (
                <div style={{backgroundColor: `${colors.foreground}20`, height: 8, marginTop: 44}}>
                  <div style={{backgroundColor: accentColor, height: "100%", width: `${metric.progress * progress * 100}%`}} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </SceneCanvas>
  );
};
