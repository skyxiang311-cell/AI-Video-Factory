import type {StoryboardScene} from "../../storyboard/schema";
import {HookScene} from "./components/HookScene";
import {KnowledgePointScene} from "./components/KnowledgePointScene";
import {StatCardScene} from "./components/StatCardScene";
import {SummaryScene} from "./components/SummaryScene";

type SceneRendererProps = {
  scene: StoryboardScene;
  logicalDurationInFrames: number;
};

const assertNever = (value: never): never => {
  throw new Error(`Unsupported presentation: ${JSON.stringify(value)}`);
};

export const SceneRenderer = ({
  scene,
  logicalDurationInFrames,
}: SceneRendererProps) => {
  const presentation = scene.presentation;

  switch (presentation.variant) {
    case "hook":
      return <HookScene scene={scene} logicalDurationInFrames={logicalDurationInFrames} />;
    case "stat-card":
      return <StatCardScene scene={scene} logicalDurationInFrames={logicalDurationInFrames} />;
    case "knowledge-point":
      return (
        <KnowledgePointScene scene={scene} logicalDurationInFrames={logicalDurationInFrames} />
      );
    case "summary-card":
      return <SummaryScene scene={scene} logicalDurationInFrames={logicalDurationInFrames} />;
    default:
      return assertNever(presentation);
  }
};
