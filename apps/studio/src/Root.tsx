import type {CalculateMetadataFunction} from "remotion";
import {Composition} from "remotion";
import {VisualKnowledgeVideo} from "../../../src/render/knowledge/VisualKnowledgeVideo";
import {sampleStoryboard} from "../../../src/storyboard/sample";
import {
  parseVisualStoryboard,
  VisualStoryboardPropsSchema,
  type VisualStoryboard,
} from "../../../src/storyboard/visual-schema";
import {buildVisualTimeline} from "../../../src/storyboard/visual-timeline";

export const calculateKnowledgeMetadata: CalculateMetadataFunction<VisualStoryboard> = ({
  props,
}) => {
  const storyboard = parseVisualStoryboard(props);
  const timeline = buildVisualTimeline(storyboard);

  return {
    width: storyboard.format.width,
    height: storyboard.format.height,
    fps: storyboard.format.fps,
    durationInFrames: timeline.durationInFrames,
    props: storyboard,
    defaultOutName: storyboard.jobId,
  };
};

export const RemotionRoot = () => (
  <>
    <Composition
      id="KnowledgeDemo"
      component={VisualKnowledgeVideo}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={900}
      defaultProps={sampleStoryboard}
      schema={VisualStoryboardPropsSchema}
      calculateMetadata={calculateKnowledgeMetadata}
    />
    <Composition
      id="BookDeepReading"
      component={VisualKnowledgeVideo}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={9000}
      defaultProps={sampleStoryboard}
      schema={VisualStoryboardPropsSchema}
      calculateMetadata={calculateKnowledgeMetadata}
    />
  </>
);
