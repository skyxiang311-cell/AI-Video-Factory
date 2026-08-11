import {linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import type {StoryboardScene} from "../../storyboard/schema";
import {millisecondsToFrames} from "../../storyboard/timeline";

export const getTransition = (scene: StoryboardScene, fps: number) => {
  if (scene.transition === "cut") {
    return null;
  }

  const durationInFrames = millisecondsToFrames(
    scene.transitionDurationMs,
    fps,
  );
  const timing = linearTiming({durationInFrames});

  switch (scene.transition) {
    case "fade":
      return {presentation: fade(), timing};
    case "slide-left":
      return {presentation: slide({direction: "from-right"}), timing};
    case "slide-up":
      return {presentation: slide({direction: "from-bottom"}), timing};
  }
};
