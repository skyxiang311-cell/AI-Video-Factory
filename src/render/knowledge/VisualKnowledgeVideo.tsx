import {TransitionSeries} from "@remotion/transitions";
import {Fragment} from "react";
import {AbsoluteFill} from "remotion";
import type {VisualStoryboard} from "../../storyboard/visual-schema";
import {buildVisualTimeline} from "../../storyboard/visual-timeline";
import {VisualSceneRenderer} from "./VisualSceneRenderer";
import {VisualCaptions} from "./components/VisualCaptions";
import {getTransition} from "./transitions";

export const VisualKnowledgeVideo = (storyboard: VisualStoryboard) => {
  const timeline = buildVisualTimeline(storyboard);
  return (
    <AbsoluteFill>
      <TransitionSeries>
        {timeline.items.map((item, index) => {
          const transition = getTransition(item.scene, storyboard.format.fps);
          const isLast = index === timeline.items.length - 1;
          return (
            <Fragment key={item.scene.id}>
              <TransitionSeries.Sequence durationInFrames={item.sequenceDurationInFrames} name={item.scene.id}>
                <VisualSceneRenderer branding={storyboard.branding} logicalDurationInFrames={item.logicalDurationInFrames} scene={item.scene} sceneCount={timeline.items.length} sceneIndex={index} />
              </TransitionSeries.Sequence>
              {!isLast && transition ? <TransitionSeries.Transition presentation={transition.presentation} timing={transition.timing} /> : null}
            </Fragment>
          );
        })}
      </TransitionSeries>
      <VisualCaptions captions={storyboard.captions} scenes={storyboard.scenes} />
    </AbsoluteFill>
  );
};
