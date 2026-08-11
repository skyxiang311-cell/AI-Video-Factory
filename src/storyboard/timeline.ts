import type {Storyboard, StoryboardScene} from "./schema";

export type TimelineItem = {
  scene: StoryboardScene;
  logicalFromFrame: number;
  logicalDurationInFrames: number;
  transitionDurationInFrames: number;
  sequenceDurationInFrames: number;
};

export type StoryboardTimeline = {
  items: TimelineItem[];
  durationInFrames: number;
};

export const millisecondsToFrames = (ms: number, fps: number): number =>
  Math.round((ms / 1000) * fps);

export const buildTimeline = (
  storyboard: Storyboard,
): StoryboardTimeline => {
  const {fps, durationMs} = storyboard.format;

  const items = storyboard.scenes.map((scene): TimelineItem => {
    const startFrame = millisecondsToFrames(scene.startMs, fps);
    const endFrame = millisecondsToFrames(scene.endMs, fps);
    const logicalDurationInFrames = endFrame - startFrame;

    if (logicalDurationInFrames < 1) {
      throw new Error(
        `Scene ${scene.id} resolves to fewer than one frame at ${fps}fps`,
      );
    }

    const transitionDurationInFrames =
      scene.transition === "cut"
        ? 0
        : millisecondsToFrames(scene.transitionDurationMs, fps);

    return {
      scene,
      logicalFromFrame: startFrame,
      logicalDurationInFrames,
      transitionDurationInFrames,
      sequenceDurationInFrames:
        logicalDurationInFrames + transitionDurationInFrames,
    };
  });

  const durationInFrames = millisecondsToFrames(durationMs, fps);
  const renderedDuration = items.reduce(
    (sum, item) =>
      sum + item.sequenceDurationInFrames - item.transitionDurationInFrames,
    0,
  );

  if (renderedDuration !== durationInFrames) {
    throw new Error(
      `Timeline resolves to ${renderedDuration} frames, expected ${durationInFrames}`,
    );
  }

  return {items, durationInFrames};
};
