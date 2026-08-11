import type {VisualStoryboard} from "../storyboard/visual-schema";

const DEMO_MODE = "voice-driven-local-demo" as const;
const DEMO_WARNING =
  "此固定样例仅用于验证 Storyboard 到 MP4 的渲染链路，不代表已完成外部事实核验。";

export const createDemoArtifacts = (storyboard: VisualStoryboard) => {
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
        title:
          storyboard.scenes[0]?.visualType === "hook"
            ? storyboard.scenes[0].visualData.headline
            : storyboard.jobId,
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
        speechStartMs: scene.speechStartMs ?? scene.startMs,
        speechEndMs: scene.speechEndMs ?? scene.endMs,
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
        kind: storyboard.audio.enabled ? "edge-tts" as const : "preview-without-audio" as const,
        usedInRender: storyboard.audio.enabled,
        ...(storyboard.audio.enabled
          ? {
              src: storyboard.audio.src,
              durationMs: storyboard.audio.durationMs,
              voice: storyboard.audio.voice,
              rate: storyboard.audio.rate,
              fingerprint: storyboard.audio.fingerprint,
            }
          : {reason: "仅用于未生成配音前的 Studio 视觉预览"}),
      },
      warning: DEMO_WARNING,
    },
  };
};

export type DemoArtifacts = ReturnType<typeof createDemoArtifacts>;
