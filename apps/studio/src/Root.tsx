import type {CalculateMetadataFunction} from "remotion";
import {Composition} from "remotion";
import {KnowledgeVideo} from "../../../src/render/knowledge/KnowledgeVideo";
import {sampleStoryboard} from "../../../src/storyboard/sample";
import {
  parseStoryboard,
  StoryboardPropsSchema,
  type Storyboard,
} from "../../../src/storyboard/schema";
import {buildTimeline} from "../../../src/storyboard/timeline";

export const calculateKnowledgeMetadata: CalculateMetadataFunction<Storyboard> = ({
  props,
}) => {
  const storyboard = parseStoryboard(props);
  const timeline = buildTimeline(storyboard);

  return {
    width: storyboard.format.width,
    height: storyboard.format.height,
    fps: storyboard.format.fps,
    durationInFrames: timeline.durationInFrames,
    props: storyboard,
    defaultOutName: "knowledge-demo",
  };
};

export const RemotionRoot = () => (
  <Composition
    id="KnowledgeDemo"
    component={KnowledgeVideo}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={720}
    defaultProps={sampleStoryboard}
    schema={StoryboardPropsSchema}
    calculateMetadata={calculateKnowledgeMetadata}
  />
);
