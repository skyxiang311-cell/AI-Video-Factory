import type {ReactNode} from "react";
import {AbsoluteFill} from "remotion";
import type {VisualStoryboard} from "../../../storyboard/visual-schema";
import {knowledgeTheme} from "../theme";
import {
  resolveCanvasColors,
  type CanvasTone,
} from "../visual-utils";
import {BrandingMark} from "./BrandingMark";
import {ProgressIndicator} from "./ProgressIndicator";

type SceneCanvasProps = {
  accentColor: string;
  branding: VisualStoryboard["branding"];
  children: ReactNode;
  sceneIndex: number;
  sceneCount: number;
  tone: CanvasTone;
};

export const SceneCanvas = ({
  accentColor,
  branding,
  children,
  sceneIndex,
  sceneCount,
  tone,
}: SceneCanvasProps) => {
  const colors = resolveCanvasColors(tone);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.background,
        backgroundImage: `linear-gradient(${accentColor}0b 1px, transparent 1px), linear-gradient(90deg, ${accentColor}0b 1px, transparent 1px)`,
        backgroundSize: "72px 72px",
        color: colors.foreground,
        fontFamily: knowledgeTheme.fontFamily,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          border: `1px solid ${accentColor}22`,
          borderRadius: 999,
          height: 620,
          position: "absolute",
          right: -330,
          top: 300,
          width: 620,
        }}
      />
      <div
        style={{
          display: "flex",
          left: knowledgeTheme.safeArea.left,
          position: "absolute",
          right: knowledgeTheme.safeArea.right,
          top: knowledgeTheme.safeArea.top,
        }}
      >
        <BrandingMark branding={branding} color={colors.muted} />
        <div style={{marginLeft: "auto"}}>
          <ProgressIndicator
            accentColor={accentColor}
            foregroundColor={colors.foreground}
            sceneCount={sceneCount}
            sceneIndex={sceneIndex}
          />
        </div>
      </div>
      <div
        style={{
          bottom: knowledgeTheme.contentBottom,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          left: knowledgeTheme.safeArea.left,
          position: "absolute",
          right: knowledgeTheme.safeArea.right,
          top: 230,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
