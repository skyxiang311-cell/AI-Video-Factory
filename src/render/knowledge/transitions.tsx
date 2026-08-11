import {linearTiming, springTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {millisecondsToFrames} from "../../storyboard/timeline";

type TransitionScene = {
  transition: "cut" | "fade" | "slide-left" | "slide-up";
  transitionDurationMs: number;
};

export const getTransition = (scene: TransitionScene, fps: number) => {
  if (scene.transition === "cut") {
    return null;
  }

  const durationInFrames = millisecondsToFrames(
    scene.transitionDurationMs,
    fps,
  );

  switch (scene.transition) {
    case "fade":
      return {presentation: fade(), timing: linearTiming({durationInFrames})};
    case "slide-left":
      return {presentation: slide({direction: "from-right"}), timing: springTiming({durationInFrames, config: {damping: 200}})};
    case "slide-up":
      return {presentation: slide({direction: "from-bottom"}), timing: springTiming({durationInFrames, config: {damping: 200}})};
  }
};
