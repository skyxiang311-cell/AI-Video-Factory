import {TransitionSeries} from "@remotion/transitions";
import {Fragment} from "react";
import {AbsoluteFill} from "remotion";
import type {Storyboard} from "../../storyboard/schema";
import {buildTimeline} from "../../storyboard/timeline";
import {SceneRenderer} from "./SceneRenderer";
import {DynamicCaptions} from "./components/DynamicCaptions";
import {getTransition} from "./transitions";

export const KnowledgeVideo = (storyboard: Storyboard) => {
  const timeline = buildTimeline(storyboard);

  return (
    <AbsoluteFill>
      <TransitionSeries>
        {timeline.items.map((item, index) => {
          const transition = getTransition(item.scene, storyboard.format.fps);
          const isLast = index === timeline.items.length - 1;

          return (
            <Fragment key={item.scene.id}>
              <TransitionSeries.Sequence
                durationInFrames={item.sequenceDurationInFrames}
                name={item.scene.id}
              >
                <SceneRenderer
                  scene={item.scene}
                  logicalDurationInFrames={item.logicalDurationInFrames}
                />
              </TransitionSeries.Sequence>
              {!isLast && transition ? (
                <TransitionSeries.Transition
                  presentation={transition.presentation}
                  timing={transition.timing}
                />
              ) : null}
            </Fragment>
          );
        })}
      </TransitionSeries>
      <DynamicCaptions captions={storyboard.captions} scenes={storyboard.scenes} />
    </AbsoluteFill>
  );
};
