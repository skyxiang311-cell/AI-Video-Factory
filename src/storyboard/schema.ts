import {z} from "zod";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const CURRENCY_UNIT_PATTERN = /(日元|人民币|美元|欧元|英镑|港元|新台币)/;

export const CaptionSchema = z.object({
  text: z.string().min(1).max(24),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  timestampMs: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export const PresentationSchema = z.discriminatedUnion("variant", [
  z.object({
    variant: z.literal("hook"),
    accentColor: z.string().regex(HEX_COLOR_PATTERN),
  }),
  z.object({
    variant: z.literal("stat-card"),
    accentColor: z.string().regex(HEX_COLOR_PATTERN),
    metric: z.object({
      value: z.string().min(1),
      unit: z.string().min(1),
      label: z.string().min(1),
    }),
  }),
  z.object({
    variant: z.literal("knowledge-point"),
    accentColor: z.string().regex(HEX_COLOR_PATTERN),
    pointNumber: z.number().int().min(1).max(5),
  }),
  z.object({
    variant: z.literal("summary-card"),
    accentColor: z.string().regex(HEX_COLOR_PATTERN),
  }),
]);

export const SceneSchema = z.object({
  id: z.string().regex(/^scene-[a-z0-9-]+$/),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  purpose: z.enum(["hook", "context", "knowledge", "summary"]),
  voiceText: z.string().min(1),
  onScreenText: z.array(z.string().min(1)).min(1).max(4),
  visualIntent: z.string().min(1),
  assetRefs: z.array(z.string()),
  emphasis: z.array(z.string()),
  contentFlags: z.array(z.enum(["foreign-price"])).default([]),
  transition: z.enum(["cut", "fade", "slide-left", "slide-up"]),
  transitionDurationMs: z.number().int().min(0).max(600),
  presentation: PresentationSchema,
});

export const StoryboardPropsSchema = z.object({
  schemaVersion: z.literal("1.0"),
  jobId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  format: z.object({
    width: z.literal(1080),
    height: z.literal(1920),
    fps: z.literal(30),
    durationMs: z.number().int().positive().max(180_000),
  }),
  template: z.literal("knowledge"),
  scenes: z.array(SceneSchema).min(1),
  captions: z.array(CaptionSchema).min(1),
});

type StoryboardProps = z.infer<typeof StoryboardPropsSchema>;

const addIssue = (
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string,
): void => {
  context.addIssue({code: "custom", path, message});
};

const validateStoryboardRelations = (
  storyboard: StoryboardProps,
  context: z.RefinementCtx,
): void => {
  const {captions, format, scenes} = storyboard;
  const seenSceneIds = new Set<string>();

  scenes.forEach((scene, index) => {
    if (seenSceneIds.has(scene.id)) {
      addIssue(context, ["scenes", index, "id"], "场景 ID 必须唯一");
    }
    seenSceneIds.add(scene.id);

    if (scene.endMs <= scene.startMs) {
      addIssue(context, ["scenes", index, "endMs"], "场景结束时间必须晚于开始时间");
    }

    if (index === 0 && scene.startMs !== 0) {
      addIssue(context, ["scenes", index, "startMs"], "第一幕必须从 0ms 开始");
    }

    if (index === 0 && scene.purpose !== "hook") {
      addIssue(context, ["scenes", index, "purpose"], "第一幕必须是 hook");
    }

    if (scene.purpose === "hook" && index !== 0) {
      addIssue(context, ["scenes", index, "purpose"], "hook 只能出现在第一幕");
    }

    if (scene.purpose === "hook" && scene.endMs > 3000) {
      addIssue(context, ["scenes", index, "endMs"], "hook 不得超过前三秒");
    }

    if (scene.purpose === "summary" && index !== scenes.length - 1) {
      addIssue(context, ["scenes", index, "purpose"], "summary 只能出现在最后一幕");
    }

    if (index === scenes.length - 1 && scene.purpose !== "summary") {
      addIssue(context, ["scenes", index, "purpose"], "最后一幕必须是 summary");
    }

    const expectedVariant = {
      hook: "hook",
      context: "stat-card",
      knowledge: "knowledge-point",
      summary: "summary-card",
    }[scene.purpose];
    if (scene.presentation.variant !== expectedVariant) {
      addIssue(
        context,
        ["scenes", index, "presentation", "variant"],
        `场景 purpose=${scene.purpose} 必须使用 ${expectedVariant} 布局`,
      );
    }

    if (scene.transition === "cut" && scene.transitionDurationMs !== 0) {
      addIssue(
        context,
        ["scenes", index, "transitionDurationMs"],
        "cut 转场时长必须为 0ms",
      );
    }

    if (scene.transition !== "cut" && scene.transitionDurationMs < 1) {
      addIssue(
        context,
        ["scenes", index, "transitionDurationMs"],
        "动态转场时长必须大于 0ms",
      );
    }

    const nextScene = scenes[index + 1];
    if (nextScene) {
      if (nextScene.startMs !== scene.endMs) {
        addIssue(
          context,
          ["scenes", index + 1, "startMs"],
          "相邻场景必须连续且不能重叠",
        );
      }

      if (scene.transition !== "cut") {
        const sceneDuration = scene.endMs - scene.startMs;
        const nextDuration = nextScene.endMs - nextScene.startMs;
        if (
          scene.transitionDurationMs * 2 >= sceneDuration ||
          scene.transitionDurationMs * 2 >= nextDuration
        ) {
          addIssue(
            context,
            ["scenes", index, "transitionDurationMs"],
            "转场时长必须小于相邻两幕时长的一半",
          );
        }
      }
    }

    if (index === scenes.length - 1 && scene.transition !== "cut") {
      addIssue(context, ["scenes", index, "transition"], "最后一幕必须使用 cut 结束");
    }

    const searchableText = `${scene.voiceText}\n${scene.onScreenText.join("\n")}`;
    scene.emphasis.forEach((emphasis, emphasisIndex) => {
      if (!searchableText.includes(emphasis)) {
        addIssue(
          context,
          ["scenes", index, "emphasis", emphasisIndex],
          "强调文本必须出现在口播或屏幕文本中",
        );
      }
    });

    if (
      scene.contentFlags.includes("foreign-price") &&
      !CURRENCY_UNIT_PATTERN.test(searchableText)
    ) {
      addIssue(
        context,
        ["scenes", index, "contentFlags"],
        "国外价格内容必须明确货币单位",
      );
    }
  });

  const finalScene = scenes.at(-1);
  if (finalScene && finalScene.endMs !== format.durationMs) {
    addIssue(
      context,
      ["scenes", scenes.length - 1, "endMs"],
      "最后一幕结束时间必须等于视频总时长",
    );
  }

  captions.forEach((caption, index) => {
    if (caption.endMs <= caption.startMs) {
      addIssue(context, ["captions", index, "endMs"], "字幕结束时间必须晚于开始时间");
    }
    if (caption.endMs > format.durationMs) {
      addIssue(context, ["captions", index, "endMs"], "字幕不得超过视频总时长");
    }
    const previousCaption = captions[index - 1];
    if (previousCaption && caption.startMs < previousCaption.endMs) {
      addIssue(context, ["captions", index, "startMs"], "字幕不得相互重叠");
    }
  });
};

export const StoryboardSchema = StoryboardPropsSchema.superRefine(
  validateStoryboardRelations,
);

export type Storyboard = z.infer<typeof StoryboardSchema>;
export type StoryboardScene = z.infer<typeof SceneSchema>;
export type StoryboardCaption = z.infer<typeof CaptionSchema>;

export const parseStoryboard = (input: unknown): Storyboard =>
  StoryboardSchema.parse(input);
