import {z} from "zod";
import {layoutChineseCaption} from "./caption-layout";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const CURRENCY_UNIT_PATTERN = /(日元|人民币|美元|欧元|英镑|港元|新台币)/;

export const IconNameSchema = z.enum([
  "book",
  "brain",
  "search",
  "check",
  "close",
  "clock",
  "shuffle",
  "repeat",
  "bookmark",
  "arrow",
]);

export const AccentNameSchema = z.enum(["vermilion", "indigo", "moss", "gold"]);

const CaptionEmphasisSchema = z.object({
  text: z.string().min(1).max(12),
  style: z.enum(["accent", "strong", "large"]),
});

export const VisualCaptionSchema = z.object({
  text: z.string().min(1).max(24),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  timestampMs: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  emphasis: z.array(CaptionEmphasisSchema).max(2).default([]),
});

const HookSceneSchema = z.object({
  visualType: z.literal("hook"),
  visualData: z.object({
    headline: z.string().min(1).max(30),
    supporting: z.string().min(1).max(40).optional(),
    highlight: z.string().min(1).max(16),
    motif: z.enum(["contrast", "question", "conclusion"]),
    accent: AccentNameSchema,
    tone: z.enum(["ink", "paper"]),
  }),
});

const DiagramNodeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().min(1).max(14),
  detail: z.string().min(1).max(22).optional(),
  icon: IconNameSchema,
});

const DiagramSceneSchema = z.object({
  visualType: z.literal("diagram"),
  visualData: z.object({
    title: z.string().min(1).max(26),
    layout: z.enum(["horizontal-flow", "vertical-flow", "cycle", "relation"]),
    accent: AccentNameSchema,
    tone: z.enum(["ink", "paper"]),
    nodes: z.array(DiagramNodeSchema).min(2).max(5),
    edges: z.array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        label: z.string().min(1).max(10).optional(),
      }),
    ).min(1).max(6),
  }),
});

const StatMetricSchema = z.object({
  value: z.number().finite(),
  decimals: z.number().int().min(0).max(2).default(0),
  prefix: z.string().max(4).default(""),
  suffix: z.string().max(6).default(""),
  label: z.string().min(1).max(22),
  progress: z.number().min(0).max(1).optional(),
  icon: IconNameSchema.optional(),
});

const StatSceneSchema = z.object({
  visualType: z.literal("stat"),
  visualData: z.object({
    title: z.string().min(1).max(26),
    mode: z.enum(["single", "ratio", "ranking"]),
    accent: AccentNameSchema,
    tone: z.enum(["ink", "paper"]),
    metrics: z.array(StatMetricSchema).min(1).max(3),
  }),
});

const ComparisonSideSchema = z.object({
  label: z.string().min(1).max(8),
  headline: z.string().min(1).max(18),
  points: z.array(z.string().min(1).max(18)).min(1).max(3),
  icon: IconNameSchema,
});

const ComparisonSceneSchema = z.object({
  visualType: z.literal("comparison"),
  visualData: z.object({
    title: z.string().min(1).max(26),
    mode: z.enum(["wrong-right", "a-b"]),
    accent: AccentNameSchema,
    tone: z.enum(["ink", "paper"]),
    left: ComparisonSideSchema,
    right: ComparisonSideSchema,
  }),
});

const SummarySceneSchema = z.object({
  visualType: z.literal("summary"),
  visualData: z.object({
    title: z.string().min(1).max(26),
    accent: AccentNameSchema,
    tone: z.enum(["ink", "paper"]),
    items: z.array(
      z.object({
        label: z.string().min(1).max(18),
        icon: IconNameSchema,
      }),
    ).min(3).max(5),
    closing: z.string().min(1).max(28),
  }),
});

const SceneVisualSchema = z.discriminatedUnion("visualType", [
  HookSceneSchema,
  DiagramSceneSchema,
  StatSceneSchema,
  ComparisonSceneSchema,
  SummarySceneSchema,
]);

const VisualSceneBaseSchema = z.object({
  id: z.string().regex(/^scene-[a-z0-9-]+$/),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  purpose: z.enum(["hook", "context", "knowledge", "summary"]),
  voiceText: z.string().min(1),
  visualIntent: z.string().min(1),
  assetRefs: z.array(z.string()),
  emphasis: z.array(z.string().min(1)),
  contentFlags: z.array(z.enum(["foreign-price"])).default([]),
  transition: z.enum(["cut", "fade", "slide-left", "slide-up"]),
  transitionDurationMs: z.number().int().min(0).max(600),
});

export const VisualSceneSchema = z.intersection(
  VisualSceneBaseSchema,
  SceneVisualSchema,
);

export const BrandingSchema = z.discriminatedUnion("enabled", [
  z.object({enabled: z.literal(false)}),
  z.object({
    enabled: z.literal(true),
    label: z.string().min(1).max(20),
    position: z.enum(["top-left", "top-right"]),
  }),
]);

export const VisualStoryboardPropsSchema = z.object({
  schemaVersion: z.literal("1.1"),
  jobId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  format: z.object({
    width: z.literal(1080),
    height: z.literal(1920),
    fps: z.literal(30),
    durationMs: z.number().int().positive().max(180_000),
  }),
  template: z.literal("knowledge"),
  branding: BrandingSchema,
  scenes: z.array(VisualSceneSchema).min(1),
  captions: z.array(VisualCaptionSchema).min(1),
});

type VisualStoryboardProps = z.infer<typeof VisualStoryboardPropsSchema>;

const addIssue = (
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string,
): void => context.addIssue({code: "custom", path, message});

const validateVisualStoryboard = (
  storyboard: VisualStoryboardProps,
  context: z.RefinementCtx,
): void => {
  const seenIds = new Set<string>();
  storyboard.scenes.forEach((scene, index) => {
    if (seenIds.has(scene.id)) {
      addIssue(context, ["scenes", index, "id"], "场景 ID 必须唯一");
    }
    seenIds.add(scene.id);
    if (index === 0 && (scene.startMs !== 0 || scene.visualType !== "hook")) {
      addIssue(context, ["scenes", index, "visualType"], "第一幕必须从 0ms 开始并使用 hook");
    }
    if (scene.visualType === "hook" && index !== 0) {
      addIssue(context, ["scenes", index, "visualType"], "hook 只能出现在第一幕");
    }
    if (scene.purpose === "hook" && scene.endMs > 3000) {
      addIssue(context, ["scenes", index, "endMs"], "hook 不得超过前三秒");
    }
    if (index === storyboard.scenes.length - 1 && scene.visualType !== "summary") {
      addIssue(context, ["scenes", index, "visualType"], "最后一幕必须使用 summary");
    }
    if (scene.visualType === "summary" && index !== storyboard.scenes.length - 1) {
      addIssue(context, ["scenes", index, "visualType"], "summary 只能出现在最后一幕");
    }
    const next = storyboard.scenes[index + 1];
    if (next && next.startMs !== scene.endMs) {
      addIssue(context, ["scenes", index + 1, "startMs"], "相邻场景必须连续且不能重叠");
    }
    if (scene.transition === "cut" && scene.transitionDurationMs !== 0) {
      addIssue(context, ["scenes", index, "transitionDurationMs"], "cut 转场时长必须为 0ms");
    }
    if (scene.transition !== "cut" && scene.transitionDurationMs < 1) {
      addIssue(context, ["scenes", index, "transitionDurationMs"], "动态转场时长必须大于 0ms");
    }
    if (scene.visualType === "diagram") {
      const nodeIds = new Set(scene.visualData.nodes.map((node) => node.id));
      scene.visualData.edges.forEach((edge, edgeIndex) => {
        if (!nodeIds.has(edge.from)) {
          addIssue(context, ["scenes", index, "visualData", "edges", edgeIndex, "from"], "流程线起点必须引用现有节点");
        }
        if (!nodeIds.has(edge.to)) {
          addIssue(context, ["scenes", index, "visualData", "edges", edgeIndex, "to"], "流程线终点必须引用现有节点");
        }
      });
    }
    const searchableText = `${scene.voiceText}\n${JSON.stringify(scene.visualData)}`;
    scene.emphasis.forEach((value, emphasisIndex) => {
      if (!searchableText.includes(value)) {
        addIssue(context, ["scenes", index, "emphasis", emphasisIndex], "强调文本必须出现在口播或视觉数据中");
      }
    });
    if (scene.contentFlags.includes("foreign-price") && !CURRENCY_UNIT_PATTERN.test(searchableText)) {
      addIssue(context, ["scenes", index, "contentFlags"], "国外价格内容必须明确货币单位");
    }
  });
  if (storyboard.scenes.at(-1)?.endMs !== storyboard.format.durationMs) {
    addIssue(context, ["scenes", storyboard.scenes.length - 1, "endMs"], "最后一幕结束时间必须等于视频总时长");
  }
  storyboard.captions.forEach((caption, index) => {
    if (caption.endMs <= caption.startMs || caption.endMs > storyboard.format.durationMs) {
      addIssue(context, ["captions", index, "endMs"], "字幕时间必须有效且落在视频总时长内");
    }
    if (index > 0 && caption.startMs < storyboard.captions[index - 1]!.endMs) {
      addIssue(context, ["captions", index, "startMs"], "字幕不得相互重叠");
    }
    caption.emphasis.forEach((value, emphasisIndex) => {
      if (!caption.text.includes(value.text)) {
        addIssue(context, ["captions", index, "emphasis", emphasisIndex, "text"], "字幕强调词必须出现在字幕文本中");
      }
    });
    try {
      layoutChineseCaption(caption.text);
    } catch {
      addIssue(context, ["captions", index, "text"], "字幕必须能在最多两行内安全展示");
    }
  });
};

export const VisualStoryboardSchema = VisualStoryboardPropsSchema.superRefine(
  validateVisualStoryboard,
);

export type VisualStoryboard = z.infer<typeof VisualStoryboardSchema>;
export type VisualScene = z.infer<typeof VisualSceneSchema>;
export type VisualCaption = z.infer<typeof VisualCaptionSchema>;

export const parseVisualStoryboard = (input: unknown): VisualStoryboard =>
  VisualStoryboardSchema.parse(input);
