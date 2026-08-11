import type {VisualScene, VisualStoryboard} from "../../storyboard/visual-schema";
import {ComparisonScene} from "./scenes/ComparisonScene";
import {DiagramScene} from "./scenes/DiagramScene";
import {HookScene} from "./scenes/HookScene";
import {StatScene} from "./scenes/StatScene";
import {SummaryScene} from "./scenes/SummaryScene";

type VisualSceneRendererProps = {
  branding: VisualStoryboard["branding"];
  logicalDurationInFrames: number;
  scene: VisualScene;
  sceneCount: number;
  sceneIndex: number;
};

export const VisualSceneRenderer = ({branding, logicalDurationInFrames, scene, sceneCount, sceneIndex}: VisualSceneRendererProps) => {
  const common = {branding, logicalDurationInFrames, sceneCount, sceneIndex};
  switch (scene.visualType) {
    case "hook":
      return <HookScene {...common} scene={scene} />;
    case "diagram":
      return <DiagramScene {...common} scene={scene} />;
    case "stat":
      return <StatScene {...common} scene={scene} />;
    case "comparison":
      return <ComparisonScene {...common} scene={scene} />;
    case "summary":
      return <SummaryScene {...common} scene={scene} />;
  }
};
