import type {Storyboard} from "../schema";
import type {VisualScene, VisualStoryboard} from "../visual-schema";

const migrateScene = (scene: Storyboard["scenes"][number]): VisualScene => {
  const base = {
    id: scene.id,
    startMs: scene.startMs,
    endMs: scene.endMs,
    purpose: scene.purpose,
    voiceText: scene.voiceText,
    onScreenText: scene.onScreenText,
    visualIntent: scene.visualIntent,
    assetRefs: scene.assetRefs,
    emphasis: scene.emphasis,
    contentFlags: scene.contentFlags,
    transition: scene.transition,
    transitionDurationMs: scene.transitionDurationMs,
  } as const;
  const [headline = scene.voiceText, supporting = scene.voiceText] = scene.onScreenText;

  switch (scene.presentation.variant) {
    case "hook":
      return {
        ...base,
        visualType: "hook",
        visualData: {
          headline,
          supporting,
          highlight: scene.emphasis[0] ?? headline,
          motif: "contrast",
          accent: "gold",
          tone: "ink",
        },
      };
    case "stat-card":
      return {
        ...base,
        visualType: "stat",
        visualData: {
          title: headline,
          mode: "single",
          accent: "moss",
          tone: "paper",
          metrics: [{
            value: Number(scene.presentation.metric.value),
            decimals: 0,
            prefix: "",
            suffix: scene.presentation.metric.unit,
            label: scene.presentation.metric.label,
          }],
        },
      };
    case "knowledge-point":
      return {
        ...base,
        visualType: "diagram",
        visualData: {
          title: headline,
          layout: "horizontal-flow",
          accent: "indigo",
          tone: "ink",
          nodes: [
            {id: "idea", label: headline, icon: "brain"},
            {id: "action", label: supporting, icon: "check"},
          ],
          edges: [{from: "idea", to: "action"}],
        },
      };
    case "summary-card":
      return {
        ...base,
        visualType: "summary",
        visualData: {
          title: headline,
          accent: "gold",
          tone: "paper",
          items: scene.onScreenText.slice(0, 3).map((label, index) => ({
            label,
            icon: index === 0 ? "repeat" : index === 1 ? "clock" : "shuffle",
          })),
          closing: scene.onScreenText.at(-1) ?? headline,
        },
      };
  }
};

export const migrateStoryboardV1ToV1_1 = (
  storyboard: Storyboard,
): VisualStoryboard => ({
  schemaVersion: "1.1",
  jobId: storyboard.jobId,
  format: storyboard.format,
  template: storyboard.template,
  branding: {enabled: false},
  narration: {
    preset: "natural",
    blocks: storyboard.scenes.map((scene) => ({
      id: `speech-${scene.id.replace(/^scene-/u, "")}`,
      sceneIds: [scene.id],
      pauseAfter: scene.purpose === "summary" ? "important-conclusion" as const : "sentence" as const,
    })),
  },
  audio: {enabled: false},
  scenes: storyboard.scenes.map(migrateScene),
  captions: storyboard.captions.map((caption) => ({
    ...caption,
    emphasis: [],
    tokens: [],
    alignmentSource: "fixed-preview" as const,
  })),
});
