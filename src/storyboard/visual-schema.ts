import {z} from "zod";
import {layoutChineseCaption} from "./caption-layout";
import {getStoryboardProfile, StoryboardProfileNameSchema} from "./profile";

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

const CaptionTokenSchema = z.object({
  text: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
});

export const VisualCaptionSchema = z.object({
  text: z.string().min(1).max(24),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  timestampMs: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  emphasis: z.array(CaptionEmphasisSchema).max(2).default([]),
  tokens: z.array(CaptionTokenSchema).default([]),
  alignmentSource: z.enum([
    "fixed-preview",
    "edge-word-boundary",
    "duration-weighted-fallback",
  ]).default("fixed-preview"),
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
  speechStartMs: z.number().int().nonnegative().optional(),
  speechEndMs: z.number().int().positive().optional(),
  purpose: z.enum(["hook", "context", "knowledge", "summary"]),
  voiceText: z.string().min(1),
  onScreenText: z.array(z.string().min(1).max(30)).min(1).max(6),
  visualIntent: z.string().min(1),
  assetRefs: z.array(z.string()),
  claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/)).default([]),
  sourceRefs: z.array(z.object({
    type: z.literal("book"),
    chapterId: z.string().regex(/^chapter-[a-z0-9-]+$/),
    page: z.number().int().positive(),
    blockId: z.string().regex(/^p\d+-[a-z0-9-]+$/),
  })).optional(),
  sourceNote: z.string().min(1).max(30).optional(),
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

const PauseKindSchema = z.enum([
  "short",
  "sentence",
  "knowledge-switch",
  "important-conclusion",
]);

const NarrationSchema = z.object({
  preset: z.enum(["natural", "energetic", "calm"]).default("natural"),
  blocks: z.array(z.object({
    id: z.string().regex(/^speech-[a-z0-9-]+$/),
    sceneIds: z.array(z.string().regex(/^scene-[a-z0-9-]+$/)).min(1),
    pauseAfter: PauseKindSchema,
  })).min(1),
});

const deriveOnScreenText = (scene: Record<string, unknown>): string[] => {
  const visualData = scene.visualData as Record<string, unknown> | undefined;
  if (!visualData) return [String(scene.voiceText ?? "")].filter(Boolean);
  const candidates: unknown[] = [visualData.headline, visualData.supporting, visualData.title];
  if (Array.isArray(visualData.nodes)) {
    candidates.push(...visualData.nodes.map((node) => (node as Record<string, unknown>).label));
  }
  if (Array.isArray(visualData.items)) {
    candidates.push(...visualData.items.map((item) => (item as Record<string, unknown>).label));
  }
  for (const sideName of ["left", "right"] as const) {
    const side = visualData[sideName] as Record<string, unknown> | undefined;
    if (side) candidates.push(side.headline);
  }
  candidates.push(visualData.closing);
  return candidates.filter((value): value is string => typeof value === "string" && value.length > 0).slice(0, 6);
};

const upgradeLegacyVisualStoryboard = (input: unknown): unknown => {
  if (!input || typeof input !== "object") return input;
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== "1.1" || !Array.isArray(value.scenes)) return input;
  const scenes = value.scenes.map((rawScene) => {
    const scene = rawScene as Record<string, unknown>;
    return scene.onScreenText ? scene : {...scene, onScreenText: deriveOnScreenText(scene)};
  });
  const narration = value.narration ?? {
    preset: "natural",
    blocks: scenes.map((scene) => ({
      id: `speech-${String(scene.id).replace(/^scene-/u, "")}`,
      sceneIds: [scene.id],
      pauseAfter: scene.purpose === "summary" ? "important-conclusion" : "sentence",
    })),
  };
  return {...value, scenes, narration};
};

export const VisualStoryboardPropsSchema = z.object({
  schemaVersion: z.union([z.literal("1.1"), z.literal("1.2")]),
  jobId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  format: z.object({
    width: z.literal(1080),
    height: z.literal(1920),
    fps: z.literal(30),
    durationMs: z.number().int().positive().max(360_000),
  }),
  template: z.literal("knowledge"),
  profile: StoryboardProfileNameSchema.default("knowledge-short"),
  branding: BrandingSchema,
  narration: NarrationSchema,
  audio: z.discriminatedUnion("enabled", [
    z.object({enabled: z.literal(false)}),
    z.object({
      enabled: z.literal(true),
      src: z.string().min(1),
      durationMs: z.number().int().positive(),
      provider: z.string().min(1),
      voice: z.string().min(1),
      rate: z.string().min(1),
      pitch: z.string().min(1).default("+0Hz"),
      volume: z.string().min(1).default("+0%"),
      preset: z.enum(["natural", "energetic", "calm"]).default("natural"),
      fingerprint: z.string().min(1),
    }),
  ]).default({enabled: false}),
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
  const profile = getStoryboardProfile(storyboard.profile);
  const seenIds = new Set<string>();

  if (storyboard.format.durationMs > profile.hardMaxDurationMs) {
    addIssue(
      context,
      ["format", "durationMs"],
      `profile=${profile.name} 视频时长不得超过 ${profile.hardMaxDurationMs}ms`,
    );
  }

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
    if (scene.purpose === "hook" && scene.endMs > profile.primaryHookMaxMs) {
      addIssue(context, ["scenes", index, "endMs"], "hook 不得超过前三秒");
    }
    if (
      scene.speechStartMs !== undefined &&
      scene.speechEndMs !== undefined &&
      (scene.speechStartMs < scene.startMs ||
        scene.speechEndMs <= scene.speechStartMs ||
        scene.speechEndMs > scene.endMs)
    ) {
      addIssue(context, ["scenes", index, "speechEndMs"], "口播时间必须落在所属场景内");
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
    if (scene.voiceText.trim() === scene.onScreenText.join("").trim()) {
      addIssue(context, ["scenes", index, "voiceText"], "口播不能直接朗读屏幕文案");
    }
    const serializedVisualData = JSON.stringify(scene.visualData);
    scene.onScreenText.forEach((text, textIndex) => {
      if (!serializedVisualData.includes(text)) {
        addIssue(context, ["scenes", index, "onScreenText", textIndex], "屏幕文案必须实际出现在 visualData 中");
      }
    });
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
  const narratedSceneIds = storyboard.narration.blocks.flatMap((block) => block.sceneIds);
  if (
    narratedSceneIds.length !== storyboard.scenes.length ||
    new Set(narratedSceneIds).size !== storyboard.scenes.length ||
    storyboard.scenes.some((scene, index) => narratedSceneIds[index] !== scene.id)
  ) {
    addIssue(context, ["narration", "blocks"], "Narration 必须按场景顺序且不重复地覆盖全部场景");
  }
  if (storyboard.scenes.at(-1)?.endMs !== storyboard.format.durationMs) {
    addIssue(context, ["scenes", storyboard.scenes.length - 1, "endMs"], "最后一幕结束时间必须等于视频总时长");
  }
  if (
    storyboard.audio.enabled &&
    storyboard.audio.durationMs !== storyboard.format.durationMs
  ) {
    addIssue(context, ["audio", "durationMs"], "音频时长必须等于视频时间轴时长");
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
    caption.tokens.forEach((token, tokenIndex) => {
      if (
        token.endMs <= token.startMs ||
        token.startMs < caption.startMs ||
        token.endMs > caption.endMs
      ) {
        addIssue(context, ["captions", index, "tokens", tokenIndex], "字幕 token 时间必须落在字幕范围内");
      }
    });
    try {
      layoutChineseCaption(caption.text);
    } catch {
      addIssue(context, ["captions", index, "text"], "字幕必须能在最多两行内安全展示");
    }
  });
};

export const VisualStoryboardSchema = z.preprocess(
  upgradeLegacyVisualStoryboard,
  VisualStoryboardPropsSchema.superRefine(validateVisualStoryboard),
);

export type VisualStoryboard = z.infer<typeof VisualStoryboardSchema>;
export type VisualScene = z.infer<typeof VisualSceneSchema>;
export type VisualCaption = z.infer<typeof VisualCaptionSchema>;

export const parseVisualStoryboard = (input: unknown): VisualStoryboard =>
  VisualStoryboardSchema.parse(input);
