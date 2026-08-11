import type {Storyboard} from "../storyboard/schema";

const DEMO_MODE = "fixed-local-demo" as const;
const DEMO_WARNING =
  "此固定样例仅用于验证 Storyboard 到 MP4 的渲染链路，不代表已完成外部事实核验。";

export const createDemoArtifacts = (storyboard: Storyboard) => {
  const common = {
    schemaVersion: storyboard.schemaVersion,
    jobId: storyboard.jobId,
    mode: DEMO_MODE,
  };
  const knowledgeScenes = storyboard.scenes.filter(
    (scene) => scene.purpose === "knowledge",
  );

  return {
    source: {
      ...common,
      input: {
        kind: "text" as const,
        title: storyboard.scenes[0]?.onScreenText[0] ?? storyboard.jobId,
        text: storyboard.scenes.map((scene) => scene.voiceText).join("\n"),
      },
      warning: DEMO_WARNING,
    },
    analysis: {
      ...common,
      summary: storyboard.scenes.at(-1)?.voiceText ?? "",
      keyPoints: knowledgeScenes.map((scene) => ({
        sceneId: scene.id,
        text: scene.voiceText,
        emphasis: scene.emphasis,
      })),
      warning: DEMO_WARNING,
    },
    script: {
      ...common,
      durationMs: storyboard.format.durationMs,
      segments: storyboard.scenes.map((scene) => ({
        sceneId: scene.id,
        startMs: scene.startMs,
        endMs: scene.endMs,
        text: scene.voiceText,
      })),
      warning: DEMO_WARNING,
    },
    subtitles: {
      ...common,
      captions: storyboard.captions,
      warning: DEMO_WARNING,
    },
    assets: {
      ...common,
      assets: [],
      voice: {
        kind: "silent-demo-placeholder" as const,
        usedInRender: false,
        reason: "真实中文配音不在第二阶段范围内",
      },
      warning: DEMO_WARNING,
    },
  };
};

export type DemoArtifacts = ReturnType<typeof createDemoArtifacts>;
