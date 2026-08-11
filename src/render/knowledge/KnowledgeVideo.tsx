import {AbsoluteFill, Sequence} from "remotion";
import type {Storyboard} from "../../storyboard/schema";
import {buildTimeline} from "../../storyboard/timeline";
import {SceneRenderer} from "./SceneRenderer";

export const KnowledgeVideo = (storyboard: Storyboard) => {
  const timeline = buildTimeline(storyboard);

  return (
    <AbsoluteFill>
      {timeline.items.map((item) => (
        <Sequence
          key={item.scene.id}
          from={item.logicalFromFrame}
          durationInFrames={item.logicalDurationInFrames}
          name={item.scene.id}
        >
          <SceneRenderer
            scene={item.scene}
            logicalDurationInFrames={item.logicalDurationInFrames}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
