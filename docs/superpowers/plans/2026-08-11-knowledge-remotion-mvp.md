# Knowledge Remotion MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一条完全不依赖外部 AI API、由固定 Storyboard JSON 驱动、可预览并实际渲染 1080×1920 MP4 的最小 Knowledge 视频链路。

**Architecture:** 仓库根目录作为单一 Node.js + TypeScript 项目，`apps/studio/` 只负责 Remotion 注册与 Studio 入口，`src/storyboard/` 负责稳定的数据契约与时间轴，`src/render/knowledge/` 负责无文章内容写死的通用 Knowledge 模板。固定示例位于 `templates/knowledge/sample-storyboard.json`；预览、测试和渲染都解析同一个 Schema，并通过 Remotion `calculateMetadata`、`bundle()`、`selectComposition()`、`renderMedia()` 走同一条路径。

**Tech Stack:** Node.js 22.20.0、npm 10.9.3、TypeScript 5.9.3、React 19.2.8、Remotion 4.0.507、Zod 4.4.3、Vitest 4.1.10、tsx 4.23.12、`@fontsource-variable/noto-sans-sc` 5.3.0、`ffmpeg-static` 5.3.0。

## Global Constraints

- 本项目用于制作面向中国抖音、小红书用户的知识型短视频。
- 默认成片规格为 1080×1920、9:16 竖屏；本阶段 Demo 固定为 24 秒、30fps。
- 第一版只开发 Knowledge 知识型模板。
- 内容生产必须先理解原始资料，再提炼、重新组织并原创表达；本阶段只使用仓库内固定原创演示文本。
- 优先保证原创性、前三秒钩子、信息密度、收藏价值和中国用户阅读习惯。
- 涉及国外价格时必须明确货币单位；本 Demo 不使用价格内容。
- 视频视觉不能机械复制原始杂志、PDF 或网页排版。
- AI 内容层和视频渲染层必须通过 `storyboard.json` 解耦；渲染层不得依赖提示词、模型对话或未结构化输出。
- Remotion 是主要视频视觉渲染引擎；FFmpeg 只用于生成本阶段无配音情况下的有效静音 `voice.mp3` 任务产物，不参与主要视觉编排。
- 所有 `remotion` 与 `@remotion/*` 依赖必须锁定为完全相同的 `4.0.507`。
- 不接入 OpenAI、Gemini、PDF 解析、OCR、ElevenLabs、Edge TTS、Pexels、Pixabay或自动发布。
- 不创建登录、付费、SaaS 后台、多平台发布等主链路之外的功能。
- 不提交真实 API Key、令牌、密码或生成到 `output/` 下的文件。
- 所有动画必须由 `useCurrentFrame()`、`interpolate()`、Remotion timing 或 `@remotion/transitions` 驱动；禁止 CSS `transition`、CSS `animation` 和非确定性随机数。
- 1080px 宽画布的重要文字左右至少留 80px，顶部和底部至少留 100px；主标题不小于 84px，关键辅助文字不小于 44px。

---

## 1. Scope and completion boundary

本计划只证明以下路径：

```text
templates/knowledge/sample-storyboard.json
        ↓ Zod parse + cross-field validation
src/storyboard/timeline.ts
        ↓ deterministic frame timeline
src/render/knowledge/KnowledgeVideo.tsx
        ↓ Remotion bundle + Chromium render
output/knowledge-demo/final.mp4
```

本阶段不会读取 PDF、调用语言模型、生成真实语音、搜索图片或发布视频。Demo 使用纯 React/CSS 图形、中文字体包和固定 JSON，确保断网后除首次依赖/Chromium安装外仍能重复渲染。

完成时必须同时满足：

1. `npm run preview` 启动 Remotion Studio 并显示 `KnowledgeDemo` composition。
2. `npm test` 通过 Schema、时间轴和真实 MP4 smoke test。
3. `npm run render:demo` 生成 `output/knowledge-demo/final.mp4`。
4. composition 元数据为 1080×1920、30fps、720 frames（24 秒）。
5. Demo 包含 0～3 秒钩子、动态中文大标题、数字卡片、3 个知识点场景、动态中文字幕、转场和总结卡片。
6. 修改 `sample-storyboard.json` 的标题、数字或知识点后，不改 React 组件即可反映到预览和成片。
7. `output/knowledge-demo/` 包含 AGENTS.md 规定的八个任务产物；`voice.mp3` 明确标记为本阶段静音演示音轨，不伪装为真实配音。
8. 仓库不包含外部 AI SDK、API Key 或远程媒体 URL。

### Requirement coverage

| 用户要求 | 计划覆盖位置 |
| --- | --- |
| Node.js + TypeScript 基础 | Task 1 |
| Remotion 安装与配置 | Task 1、Task 4 |
| Storyboard TypeScript 类型与 Schema | Section 3、Task 2 |
| 固定 sample Storyboard | Task 2 |
| Knowledge 9:16 模板 | Task 4、Task 5 |
| 1080×1920、30fps、9:16 | Global Constraints、Task 4 |
| 15～30 秒 Demo | 固定 24 秒 sample、Task 2 |
| 钩子、标题、数字卡、3 个知识点、字幕、转场、总结 | Section 3、Task 4、Task 5 |
| 所有内容由 JSON 驱动 | Task 2、Task 4、Task 7 Step 6 |
| 禁止的 API/功能 | Global Constraints、final acceptance |
| Schema、时间轴、render smoke tests | Task 2、Task 3、Task 7 |
| 预览、测试、Demo MP4 命令 | Task 1 scripts、Task 7 README |

## 2. Planned file map

### Root project and configuration

- Create `.nvmrc` — 固定 Node.js `22.20.0`。
- Create `package.json` — 依赖、脚本和 Node engine。
- Create `package-lock.json` — npm 解析后的完整依赖锁。
- Create `tsconfig.json` — strict TypeScript、React JSX、JSON module 和 bundler module resolution。
- Create `vitest.config.ts` — Node 测试环境、测试路径和 120 秒渲染超时。
- Create `remotion.config.ts` — Remotion 输出覆盖、JPEG 中间帧和日志配置。
- Modify `.gitignore` — 增加 Remotion 缓存与测试临时输出；继续忽略 `output/**`。
- Modify `README.md` — 增加第二阶段依赖、预览、测试和 Demo 渲染命令。

### Remotion Studio entry

- Create `apps/studio/src/index.ts` — 调用 `registerRoot(RemotionRoot)`。
- Create `apps/studio/src/Root.tsx` — 注册 `KnowledgeDemo`，用 sample Storyboard 作为 `defaultProps`，通过 `calculateMetadata` 验证并计算 composition 元数据。

### Storyboard contract

- Create `src/storyboard/schema.ts` — Zod Schema、推导 TypeScript 类型、跨字段校验和 `parseStoryboard()`。
- Create `src/storyboard/timeline.ts` — 毫秒到帧、场景时长、转场重叠和总帧数计算。
- Create `src/storyboard/sample.ts` — 静态导入 JSON 并只通过 `parseStoryboard()` 暴露类型安全的 `sampleStoryboard`。
- Create `templates/knowledge/sample-storyboard.json` — 24 秒固定原创中文演示数据。

### Knowledge renderer

- Create `src/render/knowledge/theme.ts` — 颜色、字体、安全区、字号与阴影 token，不含文章内容。
- Create `src/render/knowledge/KnowledgeVideo.tsx` — 顶层 `TransitionSeries`、场景序列和字幕层。
- Create `src/render/knowledge/SceneRenderer.tsx` — 按 `presentation.variant` 分发通用场景组件。
- Create `src/render/knowledge/transitions.tsx` — Storyboard transition 到 Remotion presentation/timing 的唯一映射。
- Create `src/render/knowledge/components/SceneFrame.tsx` — 统一 9:16 背景、安全区与进度装饰。
- Create `src/render/knowledge/components/HookScene.tsx` — 通用钩子标题布局。
- Create `src/render/knowledge/components/StatCardScene.tsx` — 通用重点数字卡片。
- Create `src/render/knowledge/components/KnowledgePointScene.tsx` — 通用知识点布局。
- Create `src/render/knowledge/components/SummaryScene.tsx` — 通用结尾收藏卡片。
- Create `src/render/knowledge/components/DynamicCaptions.tsx` — Storyboard Caption JSON 分页、逐词/短语高亮和安全区布局。

### Deterministic local render

- Create `scripts/render-demo.ts` — 校验 Storyboard、原子写入任务产物、bundle、select composition、render MP4。
- Create `src/shared/demo-artifacts.ts` — 从固定 Storyboard 派生 `source.json`、`analysis.json`、`script.json`、`subtitles.json`、`assets.json` 的纯函数。
- Create `src/shared/atomic-write.ts` — 同目录临时文件写入后 `rename()`，避免半成品。

### Tests

- Create `tests/storyboard-schema.test.ts` — 有效样例和关键无效样例。
- Create `tests/timeline.test.ts` — 帧换算、转场重叠与总时长。
- Create `tests/demo-artifacts.test.ts` — 八个任务产物的确定性与声明一致性。
- Create `tests/render-smoke.test.ts` — 真实 bundle 并渲染 30 帧 H.264 MP4 到系统临时目录。

## 3. Storyboard V1 contract

`src/storyboard/schema.ts` 只导出由 Zod 推导的类型，禁止另写一份手工 interface：

```ts
export const CaptionSchema = z.object({
  text: z.string().min(1).max(24),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  timestampMs: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export const PresentationSchema = z.discriminatedUnion("variant", [
  z.object({variant: z.literal("hook"), accentColor: z.string()}),
  z.object({
    variant: z.literal("stat-card"),
    accentColor: z.string(),
    metric: z.object({value: z.string(), unit: z.string(), label: z.string()}),
  }),
  z.object({
    variant: z.literal("knowledge-point"),
    accentColor: z.string(),
    pointNumber: z.number().int().min(1).max(5),
  }),
  z.object({variant: z.literal("summary-card"), accentColor: z.string()}),
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

export const StoryboardSchema =
  StoryboardPropsSchema.superRefine(validateStoryboardRelations);

export type Storyboard = z.infer<typeof StoryboardSchema>;
export type StoryboardScene = z.infer<typeof SceneSchema>;
export type StoryboardCaption = z.infer<typeof CaptionSchema>;

export const parseStoryboard = (input: unknown): Storyboard =>
  StoryboardSchema.parse(input);
```

`StoryboardPropsSchema` 保持顶层 `z.object()`，专供 Remotion `<Composition schema={...}>` 的 Studio props UI；`StoryboardSchema` 增加跨字段规则，供 JSON 加载、`calculateMetadata`、测试和渲染命令使用。这样不会因为 refinement 包装类型破坏 Remotion 对顶层 object schema 的要求。

`validateStoryboardRelations()` 必须报告精确字段路径，并执行以下规则：

- scene ID 唯一，按 `startMs` 严格升序。
- 第一幕 `startMs === 0`，最后一幕 `endMs === format.durationMs`。
- 每幕 `endMs > startMs`；相邻场景连续，前一幕 `endMs ===` 后一幕 `startMs`。
- `purpose === "hook"` 只能出现在第一幕，且其 `endMs <= 3000`。
- `purpose === "summary"` 只能出现在最后一幕。
- `transition === "cut"` 时 `transitionDurationMs === 0`；其他转场时长为 1～600ms，且小于相邻两幕逻辑时长的一半。
- `presentation.variant` 与 purpose 对应：hook→hook，knowledge→knowledge-point；context 可用 stat-card；summary→summary-card。
- caption `endMs > startMs`，按时间升序、不重叠，且全部落在 `format.durationMs` 内。
- 每个 `emphasis` 文本必须出现在同一场景的 `voiceText` 或 `onScreenText` 中。

固定 Demo 使用 24 秒、6 个场景：

| 时间 | purpose / variant | JSON 内容职责 |
| --- | --- | --- |
| 0–3000ms | hook / hook | “同一页笔记看三遍，不如合上书回忆一次”强钩子 |
| 3000–6500ms | context / stat-card | 数字“3 步”信息卡片 |
| 6500–11000ms | knowledge / knowledge-point | ① 先回忆，再核对 |
| 11000–15500ms | knowledge / knowledge-point | ② 拉开复习间隔 |
| 15500–20000ms | knowledge / knowledge-point | ③ 混合相近问题 |
| 20000–24000ms | summary / summary-card | “回忆 → 间隔 → 交错”收藏总结 |

## 4. Timeline model

Storyboard 使用绝对毫秒且场景不重叠；Remotion `TransitionSeries` 会让相邻 sequence 重叠并缩短总长度。为保持 Storyboard 的 24 秒不被转场吃掉，时间轴采用以下明确算法：

```ts
export const millisecondsToFrames = (ms: number, fps: number): number =>
  Math.round((ms / 1000) * fps);

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
```

对每个非 `cut` 场景，将 outgoing transition frames 加到该 scene sequence 尾部，然后 `TransitionSeries.Transition` 再重叠同样的帧数：

```ts
sequenceDurationInFrames =
  logicalDurationInFrames + transitionDurationInFrames;

finalDuration =
  sum(sequenceDurationInFrames) - sum(transitionDurationInFrames);
```

因此最终仍严格等于 `millisecondsToFrames(format.durationMs, fps)`。场景组件收到 `logicalDurationInFrames`，在转场尾部钳制内容动画，避免多出的 transition tail 推进文章内容。

## 5. Implementation tasks

### Task 1: Node.js, TypeScript and Remotion foundation

**Files:**
- Create: `.nvmrc`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `remotion.config.ts`
- Create: `apps/studio/src/index.ts`
- Create: `apps/studio/src/Root.tsx`
- Create: `src/shared/video-constants.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing repository directory contract and Node.js 22.20.0.
- Produces: `VIDEO_WIDTH`, `VIDEO_HEIGHT`, `VIDEO_FPS`, npm scripts, Remotion entry point, strict typecheck/test environment.

- [ ] **Step 1: Record the runtime and create the npm manifest**

Create `.nvmrc` containing exactly `22.20.0`. Create `package.json` with `private: true`, `type: "module"`, `engines.node: ">=22.20.0 <25"`, and these scripts:

```json
{
  "scripts": {
    "preview": "remotion studio apps/studio/src/index.ts --no-open",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "render:demo": "tsx scripts/render-demo.ts"
  }
}
```

- [ ] **Step 2: Install exact project dependencies**

Run:

```bash
npm install --save-exact react@19.2.8 react-dom@19.2.8 remotion@4.0.507 @remotion/captions@4.0.507 @remotion/transitions@4.0.507 zod@4.4.3 @fontsource-variable/noto-sans-sc@5.3.0
npm install --save-dev --save-exact @remotion/cli@4.0.507 @remotion/bundler@4.0.507 @remotion/renderer@4.0.507 @types/react@19.2.18 @types/react-dom@19.2.4 typescript@5.9.3 vitest@4.1.10 tsx@4.23.12 ffmpeg-static@5.3.0
```

Expected: `package-lock.json` is created and `npm ls remotion @remotion/cli @remotion/bundler @remotion/renderer @remotion/transitions @remotion/captions` reports `4.0.507` for every Remotion package.

- [ ] **Step 3: Configure strict TypeScript and Vitest**

`tsconfig.json` must set `strict: true`, `noUncheckedIndexedAccess: true`, `jsx: "react-jsx"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `resolveJsonModule: true`, `allowSyntheticDefaultImports: true`, `noEmit: true`, and include `apps/**/*.ts`, `apps/**/*.tsx`, `src/**/*.ts`, `src/**/*.tsx`, `scripts/**/*.ts`, `tests/**/*.ts`, `*.config.ts`.

`vitest.config.ts` must use Node environment, include `tests/**/*.test.ts`, disable test concurrency for the render smoke test, and set `testTimeout: 120_000` and `hookTimeout: 120_000`.

- [ ] **Step 4: Configure Remotion and shared video constants**

Create `src/shared/video-constants.ts`:

```ts
export const VIDEO_WIDTH = 1080 as const;
export const VIDEO_HEIGHT = 1920 as const;
export const VIDEO_FPS = 30 as const;
export const DEMO_DURATION_MS = 24_000 as const;
export const DEMO_DURATION_IN_FRAMES = 720 as const;
```

`remotion.config.ts` must call `Config.setOverwriteOutput(true)` and `Config.setVideoImageFormat("jpeg")`. `apps/studio/src/Root.tsx` initially exports a minimal `RemotionRoot` that returns `null`; `apps/studio/src/index.ts` must only call `registerRoot(RemotionRoot)`. Task 4 replaces the minimal root with the real composition registration.

- [ ] **Step 5: Extend ignore rules without weakening existing protections**

Add `.remotion/` and `remotion-bundle/` to `.gitignore`. Keep `.env`, credential patterns, `node_modules/`, cache rules and `output/**` unchanged.

- [ ] **Step 6: Verify foundation**

Run:

```bash
npm run typecheck
npm test -- --passWithNoTests
git diff --check
```

Expected: typecheck succeeds after a minimal `RemotionRoot` export exists, Vitest exits successfully with no tests, and diff check has no whitespace errors.

- [ ] **Step 7: Commit foundation**

```bash
git add .nvmrc package.json package-lock.json tsconfig.json vitest.config.ts remotion.config.ts .gitignore apps/studio/src/index.ts apps/studio/src/Root.tsx src/shared/video-constants.ts
git commit -m "chore: scaffold Remotion TypeScript project"
```

### Task 2: Storyboard Schema and fixed Knowledge sample

**Files:**
- Create: `tests/storyboard-schema.test.ts`
- Create: `src/storyboard/schema.ts`
- Create: `src/storyboard/sample.ts`
- Create: `templates/knowledge/sample-storyboard.json`

**Interfaces:**
- Consumes: Zod 4.4.3 and fixed video constants.
- Produces: `StoryboardPropsSchema`, `StoryboardSchema`, `Storyboard`, `StoryboardScene`, `StoryboardCaption`, `parseStoryboard()`, `sampleStoryboard`.

- [ ] **Step 1: Write failing sample acceptance tests**

The first tests must assert:

```ts
const storyboard = parseStoryboard(sampleJson);
expect(storyboard.format).toEqual({width: 1080, height: 1920, fps: 30, durationMs: 24_000});
expect(storyboard.scenes[0]).toMatchObject({startMs: 0, endMs: 3000, purpose: "hook"});
expect(storyboard.scenes.filter((scene) => scene.purpose === "knowledge")).toHaveLength(3);
expect(storyboard.scenes.at(-1)?.purpose).toBe("summary");
expect(storyboard.captions.length).toBeGreaterThanOrEqual(8);
```

Add invalid cases for overlapping scenes, duplicate IDs, a 3001ms hook, a caption beyond 24000ms, a `cut` with nonzero transition duration, a missing `元/日元/人民币` currency unit when a scene is explicitly marked as foreign-price content, and an emphasis string absent from visible/voice text. The foreign-price rule is implemented as an optional `contentFlags: ["foreign-price"]` scene field; when present, `voiceText + onScreenText` must match `/(日元|人民币|美元|欧元|英镑|港元|新台币)/`.

- [ ] **Step 2: Run tests to verify the contract does not exist**

Run:

```bash
npm test -- tests/storyboard-schema.test.ts
```

Expected: FAIL because `src/storyboard/schema.ts` and `sample-storyboard.json` do not exist.

- [ ] **Step 3: Implement Zod Schema and relational validation**

Implement the exact contract in section 3. Every `ctx.addIssue()` must include a path such as `["scenes", index, "startMs"]` or `["captions", index, "endMs"]` and a Chinese error message.

- [ ] **Step 4: Create the fixed 24-second sample**

Create six contiguous scenes using the table in section 3. Keep every `assetRefs` array empty. Use only JSON text for titles, card values, explanations, summary and caption phrases. Use transition durations of 300ms for `fade`/`slide-left`, and `0` for the final `cut`.

Create at least eight caption entries spanning the narration, each using the Remotion `Caption` shape with `timestampMs: null` and `confidence: null`.

- [ ] **Step 5: Parse the sample at the module boundary**

`src/storyboard/sample.ts` must be exactly responsible for JSON import and validation:

```ts
import sampleJson from "../../templates/knowledge/sample-storyboard.json";
import {parseStoryboard} from "./schema";

export const sampleStoryboard = parseStoryboard(sampleJson);
```

- [ ] **Step 6: Run Schema tests and typecheck**

Run:

```bash
npm test -- tests/storyboard-schema.test.ts
npm run typecheck
```

Expected: all valid/invalid cases pass and no manually duplicated Storyboard type exists.

- [ ] **Step 7: Commit Storyboard contract**

```bash
git add tests/storyboard-schema.test.ts src/storyboard/schema.ts src/storyboard/sample.ts templates/knowledge/sample-storyboard.json
git commit -m "feat: define Knowledge storyboard contract"
```

### Task 3: Deterministic timeline calculation

**Files:**
- Create: `tests/timeline.test.ts`
- Create: `src/storyboard/timeline.ts`

**Interfaces:**
- Consumes: `Storyboard`, `StoryboardScene`.
- Produces: `millisecondsToFrames()`, `buildTimeline()`, `TimelineItem`, `StoryboardTimeline`.

- [ ] **Step 1: Write failing frame and transition tests**

Cover these exact expectations:

```ts
expect(millisecondsToFrames(3000, 30)).toBe(90);
expect(millisecondsToFrames(300, 30)).toBe(9);

const timeline = buildTimeline(sampleStoryboard);
expect(timeline.durationInFrames).toBe(720);
expect(timeline.items[0]).toMatchObject({
  logicalFromFrame: 0,
  logicalDurationInFrames: 90,
  transitionDurationInFrames: 9,
  sequenceDurationInFrames: 99,
});
expect(
  timeline.items.reduce((sum, item) => sum + item.sequenceDurationInFrames, 0) -
    timeline.items.reduce((sum, item) => sum + item.transitionDurationInFrames, 0),
).toBe(720);
```

Add a rounding test with millisecond values not divisible by a frame and assert that absolute rounded boundaries are used (`endFrame - startFrame`), preventing cumulative drift.

- [ ] **Step 2: Run test to verify timeline module is missing**

```bash
npm test -- tests/timeline.test.ts
```

Expected: FAIL because `buildTimeline()` is unavailable.

- [ ] **Step 3: Implement absolute-boundary frame math**

For each scene calculate `startFrame = millisecondsToFrames(startMs, fps)` and `endFrame = millisecondsToFrames(endMs, fps)`. Never calculate each duration independently and then sum rounded values. Add outgoing transition frames only to the owning sequence. Throw a descriptive error if computed logical duration is less than one frame.

- [ ] **Step 4: Verify timeline and Schema together**

```bash
npm test -- tests/storyboard-schema.test.ts tests/timeline.test.ts
npm run typecheck
```

Expected: both suites pass; sample duration remains exactly 720 frames.

- [ ] **Step 5: Commit timeline**

```bash
git add tests/timeline.test.ts src/storyboard/timeline.ts
git commit -m "feat: calculate storyboard timeline"
```

### Task 4: Knowledge composition and generic scene components

**Files:**
- Modify: `apps/studio/src/Root.tsx`
- Create: `src/render/knowledge/theme.ts`
- Create: `src/render/knowledge/KnowledgeVideo.tsx`
- Create: `src/render/knowledge/SceneRenderer.tsx`
- Create: `src/render/knowledge/components/SceneFrame.tsx`
- Create: `src/render/knowledge/components/HookScene.tsx`
- Create: `src/render/knowledge/components/StatCardScene.tsx`
- Create: `src/render/knowledge/components/KnowledgePointScene.tsx`
- Create: `src/render/knowledge/components/SummaryScene.tsx`
- Modify: `apps/studio/src/index.ts`

**Interfaces:**
- Consumes: `Storyboard`, `StoryboardScene`, `buildTimeline()`, `sampleStoryboard`.
- Produces: `KnowledgeVideo`, `SceneRenderer`, `RemotionRoot`, composition ID `KnowledgeDemo`.

- [ ] **Step 1: Define presentation tokens without article copy**

`theme.ts` exports colors, font stack, safe-area values and sizes only. Import `@fontsource-variable/noto-sans-sc` once in the entry. Use a dark neutral background, warm yellow accent, white primary text and muted secondary text. The safe frame uses `padding: "120px 80px 180px"`; headline size is at least 96px and supporting copy at least 48px.

- [ ] **Step 2: Implement one generic component per visual variant**

Every component receives only:

```ts
type SceneProps = {
  scene: StoryboardScene;
  logicalDurationInFrames: number;
};
```

Rules:

- `HookScene` reads headline/supporting copy from `scene.onScreenText` and animates scale/opacity in the first 12 frames.
- `StatCardScene` reads `scene.presentation.metric` and `scene.onScreenText`; the number springs from 0.82 to 1 visual scale.
- `KnowledgePointScene` reads `pointNumber` and all text from JSON; point number, title and explanation enter in staggered frame ranges.
- `SummaryScene` reads its headline and 2～3 summary lines from JSON; the final card remains stable for the last 45 frames for collection/screenshot value.
- No component contains the phrases “回忆”“间隔”“交错” or the number `3` as content literals.
- Every `interpolate()` clamps both sides; scale uses perceptual scale output.

- [ ] **Step 3: Implement scene dispatch with exhaustive typing**

`SceneRenderer` switches only on `scene.presentation.variant`. The default branch calls an `assertNever()` helper, causing TypeScript to fail when a future variant is added without a renderer.

- [ ] **Step 4: Register a JSON-driven composition**

`Root.tsx` registers:

```tsx
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
```

`calculateKnowledgeMetadata` must parse `props`, call `buildTimeline()`, and return `width`, `height`, `fps`, `durationInFrames`, `props`, and `defaultOutName: "knowledge-demo"`. It must not fetch network data.

- [ ] **Step 5: Render a diagnostic still**

Run:

```bash
npm run typecheck
npx remotion still apps/studio/src/index.ts KnowledgeDemo /tmp/ai-video-factory-hook.png --frame=30 --scale=0.25
```

Expected: command exits 0 and produces a 270×480 diagnostic PNG showing sample JSON text inside the safe area.

- [ ] **Step 6: Commit composition shell**

```bash
git add apps/studio/src src/render/knowledge
git commit -m "feat: add Knowledge video composition"
```

### Task 5: Dynamic Chinese captions and scene transitions

**Files:**
- Create: `src/render/knowledge/components/DynamicCaptions.tsx`
- Create: `src/render/knowledge/transitions.tsx`
- Modify: `src/render/knowledge/KnowledgeVideo.tsx`

**Interfaces:**
- Consumes: `StoryboardCaption[]`, `StoryboardTimeline`, scene transition fields.
- Produces: synchronized caption pages, typed Remotion transition presentation and timing.

- [ ] **Step 1: Implement caption page generation**

Use `createTikTokStyleCaptions({captions, combineTokensWithinMilliseconds: 1100})`. For each page, compute absolute start/end frames from `page.startMs`, the next page and the 1100ms cap. Skip pages with `durationInFrames <= 0`.

- [ ] **Step 2: Implement active phrase highlighting**

Render captions in a separate `DynamicCaptions` overlay, 250px above the bottom. Use `whiteSpace: "pre-wrap"`, 64px bold text, a semi-transparent dark rounded background, and highlight only the active token in the scene accent color. Derive absolute time from current frame and fps; do not use timers or CSS animation.

- [ ] **Step 3: Map transitions in one module**

`getTransition(scene, fps)` returns `null` for `cut`, otherwise returns a presentation and `linearTiming({durationInFrames})`:

- `fade` → `fade()`
- `slide-left` → `slide({direction: "from-right"})`
- `slide-up` → `slide({direction: "from-bottom"})`

Transition frames must come from `millisecondsToFrames(scene.transitionDurationMs, fps)`, not a renderer constant.

- [ ] **Step 4: Build the final TransitionSeries**

Map timeline items to `TransitionSeries.Sequence` using `sequenceDurationInFrames`. Insert a transition after a sequence only when `getTransition()` is non-null. Render `DynamicCaptions` once above the whole series so caption timing remains absolute and unaffected by local scene clocks.

- [ ] **Step 5: Verify preview and representative frames**

Run:

```bash
npm run typecheck
npx remotion still apps/studio/src/index.ts KnowledgeDemo /tmp/ai-video-factory-stat.png --frame=120 --scale=0.25
npx remotion still apps/studio/src/index.ts KnowledgeDemo /tmp/ai-video-factory-summary.png --frame=660 --scale=0.25
```

Expected: stat frame contains the JSON-driven “3 步” card and captions; summary frame contains JSON-driven conclusion text. No text is clipped or underneath the bottom unsafe area.

- [ ] **Step 6: Commit captions and transitions**

```bash
git add src/render/knowledge
git commit -m "feat: animate captions and scene transitions"
```

### Task 6: Deterministic Demo job and MP4 render command

**Files:**
- Create: `tests/demo-artifacts.test.ts`
- Create: `src/shared/demo-artifacts.ts`
- Create: `src/shared/atomic-write.ts`
- Create: `scripts/render-demo.ts`

**Interfaces:**
- Consumes: valid `Storyboard`, `sampleStoryboard`, Remotion entry point.
- Produces: `createDemoArtifacts()`, `atomicWriteJson()`, `output/knowledge-demo/{source,analysis,script,storyboard,subtitles,assets}.json`, silent `voice.mp3`, `final.mp4`.

- [ ] **Step 1: Write failing artifact tests**

Assert that `createDemoArtifacts(sampleStoryboard)` returns deterministic JSON values with the same `jobId`, that script segments exactly mirror scene `voiceText`, that subtitles exactly mirror `captions`, and that `assets.json` contains:

```json
{
  "assets": [],
  "voice": {
    "kind": "silent-demo-placeholder",
    "usedInRender": false,
    "reason": "真实中文配音不在第二阶段范围内"
  }
}
```

- [ ] **Step 2: Run test to verify artifact builder is missing**

```bash
npm test -- tests/demo-artifacts.test.ts
```

Expected: FAIL because `createDemoArtifacts()` does not exist.

- [ ] **Step 3: Implement deterministic upstream fixture artifacts**

Generate `source.json`, `analysis.json` and `script.json` only from Storyboard fields. Mark each file with `mode: "fixed-local-demo"`; include a warning that the fixture demonstrates rendering, not external fact verification. Do not call `fetch()`, read environment variables or import any AI SDK.

- [ ] **Step 4: Implement atomic JSON writes**

`atomicWriteJson(path, data)` creates the parent directory, writes `${path}.tmp` with `JSON.stringify(data, null, 2) + "\n"`, then renames it to the final path. On failure it removes only that exact temp file and rethrows with the target path in the message.

- [ ] **Step 5: Implement the render script**

`scripts/render-demo.ts` must execute in this order:

1. Parse `sampleStoryboard` again at the command boundary.
2. Create `output/knowledge-demo/` without deleting the directory.
3. Atomically write six JSON artifacts.
4. Spawn the binary exported by `ffmpeg-static` with `anullsrc`, 44.1kHz stereo, duration 24 seconds and MP3 output to `voice.tmp.mp3`; rename to `voice.mp3`. This is a truthful silent artifact and is not mixed into the Demo.
5. Call `bundle({entryPoint: resolve("apps/studio/src/index.ts")})`.
6. Call `selectComposition({serveUrl, id: "KnowledgeDemo", inputProps: storyboard})`.
7. Assert selected metadata is 1080×1920, 30fps and 720 frames.
8. Call `renderMedia({codec: "h264", pixelFormat: "yuv420p", composition, serveUrl, inputProps: storyboard, outputLocation: "output/knowledge-demo/final.tmp.mp4"})`.
9. Rename `final.tmp.mp4` to `final.mp4` only after render success.
10. Print absolute output path, elapsed time and file size; never print credentials or environment variables.

- [ ] **Step 6: Verify artifact unit tests**

```bash
npm test -- tests/demo-artifacts.test.ts
npm run typecheck
```

Expected: deterministic artifact tests pass and the render script typechecks.

- [ ] **Step 7: Commit render command**

```bash
git add tests/demo-artifacts.test.ts src/shared/demo-artifacts.ts src/shared/atomic-write.ts scripts/render-demo.ts
git commit -m "feat: add deterministic Demo renderer"
```

### Task 7: Real render smoke test, commands and final acceptance

**Files:**
- Create: `tests/render-smoke.test.ts`
- Modify: `README.md`
- Modify: `.gitignore` only if the smoke test reveals an unignored Remotion cache path.

**Interfaces:**
- Consumes: Remotion entry, `sampleStoryboard`, `KnowledgeDemo` composition.
- Produces: automated H.264 render proof and documented operator commands.

- [ ] **Step 1: Write the render smoke test**

In a test-scoped `mkdtemp(join(tmpdir(), "ai-video-factory-render-"))` directory:

```ts
const serveUrl = await bundle({entryPoint: resolve("apps/studio/src/index.ts")});
const composition = await selectComposition({
  serveUrl,
  id: "KnowledgeDemo",
  inputProps: sampleStoryboard,
});

await renderMedia({
  codec: "h264",
  pixelFormat: "yuv420p",
  composition,
  serveUrl,
  inputProps: sampleStoryboard,
  outputLocation,
  frameRange: [0, 29],
  scale: 0.25,
});

expect((await stat(outputLocation)).size).toBeGreaterThan(1024);
```

The test cleanup may remove only its own `mkdtemp` directory in `afterAll()`. It must never touch repository `output/`.

- [ ] **Step 2: Run the complete test suite**

```bash
npm test
```

Expected: Schema, timeline, artifacts and real render smoke suites all pass. The smoke test produces a nonempty H.264 MP4 and removes its temp directory.

- [ ] **Step 3: Document operator commands**

Add a Chinese “第二阶段最小链路” section to `README.md` with:

```bash
npm install
npm run preview
npm test
npm run render:demo
```

Document that Studio prints a local URL because `--no-open` is used, and that Demo output is `output/knowledge-demo/final.mp4`. Explicitly state that no AI/TTS/media-search API is configured.

- [ ] **Step 4: Render the full 24-second Demo**

```bash
npm run render:demo
```

Expected: exit code 0; `final.mp4` is nonempty; no `.tmp` file remains after success.

- [ ] **Step 5: Verify the complete job directory**

Run:

```bash
for file in source.json analysis.json script.json storyboard.json voice.mp3 subtitles.json assets.json final.mp4; do test -s "output/knowledge-demo/$file"; done
test "$(git check-ignore output/knowledge-demo/final.mp4)" = "output/knowledge-demo/final.mp4"
```

Expected: all eight files are nonempty and ignored by Git.

- [ ] **Step 6: Verify content is not hardcoded in React**

Run:

```bash
! rg -n '回忆|间隔|交错|同一页笔记' apps/studio/src src/render
rg -n '回忆|间隔|交错|同一页笔记' templates/knowledge/sample-storyboard.json
```

Expected: article-specific copy appears only in Storyboard JSON, not Remotion components.

- [ ] **Step 7: Run final quality gates**

```bash
npm run typecheck
npm test
git diff --check
git status -sb
```

Expected: typecheck and tests exit 0, diff has no whitespace errors, and only intended source/config/doc changes are present.

- [ ] **Step 8: Commit acceptance and documentation**

```bash
git add tests/render-smoke.test.ts README.md .gitignore
git commit -m "test: verify Knowledge Demo rendering"
```

Do not push until the user explicitly requests publication after reviewing the rendered Demo.

## 6. Test strategy summary

| Test | Proves | Does not claim |
| --- | --- | --- |
| `storyboard-schema.test.ts` | JSON shape、跨字段时间规则、货币单位规则、Demo 结构 | 内容事实已经外部核验 |
| `timeline.test.ts` | 毫秒到帧、绝对边界、转场不缩短总时长 | 视觉美观 |
| `demo-artifacts.test.ts` | 固定数据能生成一致的任务中间产物 | 已实现真实 ingest/research/script/TTS |
| `render-smoke.test.ts` | Remotion bundle、Chromium 和 H.264 MP4 实际可工作 | 24 秒全片每帧都经过视觉审查 |
| Full `render:demo` | Storyboard → Remotion → 24 秒 MP4 主链路 | 已接入 AI、素材搜索或发布 |

Manual visual review must inspect at least frames 30、120、240、375、510、660 and the full MP4 once. Review criteria: safe area、中文字体、标题层级、数字卡片、字幕遮挡、转场节奏、总结卡停留时间。

## 7. Risks and mitigations

### Dependency version skew

Risk: Remotion packages with different patch versions can break bundling or renderer types.

Mitigation: every Remotion package is exactly `4.0.507`; `npm ls` is an acceptance check; `package-lock.json` is committed.

### Chromium download and sandbox behavior

Risk: the first render may download Chromium, and Codex/macOS sandboxing may block browser launch or file watching.

Mitigation: Studio uses `--no-open`; smoke test has 120-second timeout; execution may require network approval for the initial browser binary. If Studio reports `EMFILE`, use `remotion studio --no-open --webpack-poll 1000` without changing composition code.

### Transition duration drift

Risk: naïve `TransitionSeries` use subtracts transition frames and makes the final video shorter than Storyboard duration.

Mitigation: add transition frames to the outgoing sequence, subtract the same overlap through `TransitionSeries`, and test the exact 720-frame result.

### Millisecond-to-frame rounding

Risk: rounding each scene duration independently accumulates drift and can desynchronize captions.

Mitigation: round absolute start/end boundaries and derive duration by subtraction; test non-frame-aligned millisecond values.

### Chinese font availability

Risk: system fonts differ between macOS and CI, causing missing glyphs or changed wrapping.

Mitigation: bundle `@fontsource-variable/noto-sans-sc`; do not fetch Google Fonts at render time; visually inspect representative frames.

### Caption density on 9:16 mobile layout

Risk: long Chinese phrases can collide with platform UI or information cards.

Mitigation: caption pages switch at 1100ms, max visible phrase length is constrained in sample validation, caption container stays 250px above the bottom, and representative-frame review is mandatory.

### Render smoke test cost

Risk: full-resolution 24-second render in every test run is slow.

Mitigation: automated smoke renders only frames 0～29 at 0.25 scale; full 1080×1920 render remains the explicit `npm run render:demo` acceptance command.

### Demo artifacts could be mistaken for production outputs

Risk: deterministic `source.json`/`analysis.json`/`script.json` and silent `voice.mp3` might be interpreted as real AI/TTS results.

Mitigation: all derived JSON files include `mode: "fixed-local-demo"`; `assets.json` declares `silent-demo-placeholder` and `usedInRender: false`; README states that AI and TTS are not connected.

### Schema evolution

Risk: later AI stages may need new visual directives, asset metadata or subtitles in a separate file.

Mitigation: keep `schemaVersion: "1.0"`, infer TypeScript from Zod, isolate presentation variants, and make render code consume only the parsed contract. Any incompatible change requires a new schema version or explicit migration.

## 8. Final acceptance checklist

- [ ] Node.js and TypeScript project files exist and `npm ci` succeeds from a clean checkout.
- [ ] All Remotion packages resolve to `4.0.507`.
- [ ] Storyboard JSON parses through one Zod contract and invalid timelines fail with field paths.
- [ ] Fixed sample is 24 seconds, 1080×1920, 30fps and contains the required six-scene structure.
- [ ] React components contain no sample article copy.
- [ ] Dynamic captions and all scene transitions are frame-driven and deterministic.
- [ ] `npm run preview` exposes `KnowledgeDemo` in Studio.
- [ ] `npm test` passes all four test areas.
- [ ] `npm run render:demo` produces a nonempty 1080×1920 H.264 MP4.
- [ ] `output/knowledge-demo/` contains all eight prescribed task artifacts and is ignored by Git.
- [ ] No OpenAI、Gemini、OCR、TTS、stock-media or publishing integration exists.
- [ ] No real credential or generated output is staged.
- [ ] Full MP4 and representative frames have been visually reviewed.

## 9. References

- Project rules: `AGENTS.md`
- Approved architecture: `docs/superpowers/specs/2026-08-11-ai-video-factory-design.md`
- Remotion project setup: <https://www.remotion.dev/docs/>
- Remotion renderer: <https://www.remotion.dev/docs/renderer/render-media>
- Remotion composition selection: <https://www.remotion.dev/docs/renderer/select-composition>
- Remotion bundler: <https://www.remotion.dev/docs/bundler/bundle>
- Remotion transitions: <https://www.remotion.dev/docs/transitions/transitionseries>
- Remotion captions: <https://www.remotion.dev/docs/captions>
