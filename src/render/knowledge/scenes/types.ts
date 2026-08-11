import type {
  VisualScene,
  VisualStoryboard,
} from "../../../storyboard/visual-schema";

export type SceneOf<T extends VisualScene["visualType"]> = Extract<
  VisualScene,
  {visualType: T}
>;

export type VisualSceneProps<T extends VisualScene["visualType"]> = {
  branding: VisualStoryboard["branding"];
  logicalDurationInFrames: number;
  scene: SceneOf<T>;
  sceneCount: number;
  sceneIndex: number;
};
