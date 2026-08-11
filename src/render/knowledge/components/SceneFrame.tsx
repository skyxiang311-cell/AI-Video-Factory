import type {ReactNode} from "react";
import {AbsoluteFill} from "remotion";
import type {StoryboardScene} from "../../../storyboard/schema";
import {knowledgeTheme} from "../theme";

export type KnowledgeSceneProps = {
  scene: StoryboardScene;
  logicalDurationInFrames: number;
};

type SceneFrameProps = {
  accentColor: string;
  children: ReactNode;
  label: string;
};

export const SceneFrame = ({accentColor, children, label}: SceneFrameProps) => (
  <AbsoluteFill
    style={{
      backgroundColor: knowledgeTheme.background,
      backgroundImage: `radial-gradient(circle at 85% 10%, ${accentColor}26 0%, transparent 34%), radial-gradient(circle at 10% 88%, ${accentColor}18 0%, transparent 30%)`,
      color: knowledgeTheme.text,
      fontFamily: knowledgeTheme.fontFamily,
      overflow: "hidden",
      padding: `${knowledgeTheme.safeArea.top}px ${knowledgeTheme.safeArea.right}px ${knowledgeTheme.safeArea.bottom}px ${knowledgeTheme.safeArea.left}px`,
    }}
  >
    <div
      style={{
        alignItems: "center",
        display: "flex",
        fontSize: 30,
        fontWeight: 700,
        gap: 18,
        letterSpacing: 4,
        textTransform: "uppercase",
      }}
    >
      <div
        style={{
          backgroundColor: accentColor,
          borderRadius: 999,
          height: 14,
          width: 54,
        }}
      />
      <span style={{color: knowledgeTheme.mutedText}}>{label}</span>
    </div>
    <div
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
    <div
      style={{
        borderTop: `2px solid ${accentColor}66`,
        color: knowledgeTheme.mutedText,
        fontSize: 28,
        paddingTop: 24,
      }}
    >
      AI VIDEO FACTORY · KNOWLEDGE
    </div>
  </AbsoluteFill>
);
