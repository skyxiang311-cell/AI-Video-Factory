import type {VisualStoryboard} from "./visual-schema";
import {millisecondsToFrames} from "./timeline";

export const buildVisualTimeline = (storyboard: VisualStoryboard) => {
  const items = storyboard.scenes.map((scene) => {
    const start = millisecondsToFrames(scene.startMs, storyboard.format.fps);
    const end = millisecondsToFrames(scene.endMs, storyboard.format.fps);
    const transitionDurationInFrames = millisecondsToFrames(
      scene.transitionDurationMs,
      storyboard.format.fps,
    );
    return {
      scene,
      logicalFromFrame: start,
      logicalDurationInFrames: end - start,
      transitionDurationInFrames,
      sequenceDurationInFrames: end - start + transitionDurationInFrames,
    };
  });
  return {
    items,
    durationInFrames: millisecondsToFrames(
      storyboard.format.durationMs,
      storyboard.format.fps,
    ),
  };
};
