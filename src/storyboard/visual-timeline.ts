import type {VisualStoryboard} from "./visual-schema";
import {millisecondsToFrames} from "./timeline";

export const buildVisualTimeline = (storyboard: VisualStoryboard) => {
  const items = storyboard.scenes.map((scene, index) => {
    const start = millisecondsToFrames(scene.startMs, storyboard.format.fps);
    const end = index === storyboard.scenes.length - 1
      ? Math.ceil((scene.endMs / 1000) * storyboard.format.fps)
      : millisecondsToFrames(scene.endMs, storyboard.format.fps);
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
    durationInFrames: Math.ceil(
      (storyboard.format.durationMs / 1000) * storyboard.format.fps,
    ),
  };
};
