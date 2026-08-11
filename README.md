# AI Video Factory

AI Video Factory 是一个面向中国抖音、小红书知识型短视频的自动化生产项目。它将 PDF、文章、截图或文字资料转化为适合中国用户观看和收藏的原创口播内容，再通过结构化分镜驱动配音、字幕、动画与成片渲染。

当前仓库处于第二阶段：已建立不依赖外部 AI API 的最小 Knowledge 视频链路，可将固定 Storyboard JSON 实际渲染为 MP4。当前没有真实 AI 内容生成或中文配音，也不包含任何真实 API Key。

## 项目目标

- 默认输出 1080×1920、9:16 的 MP4 视频。
- 默认视频时长为 60～180 秒。
- 先理解资料，再提炼并原创重构，避免逐句翻译或机械改写。
- 优先优化前三秒钩子、信息密度、收藏价值和中国用户阅读习惯。
- 通过 Storyboard JSON 解耦 AI 内容生产与视频渲染。
- 使用 Remotion 完成主要视觉渲染，使用 FFmpeg 做预处理与最终辅助处理。

## 工作流

```text
PDF / 文章 / 截图 / 文字
        ↓
内容提取
        ↓
AI 理解和重点提炼
        ↓
原创重构
        ↓
抖音 / 小红书口播脚本
        ↓
Storyboard JSON
        ↓
素材准备
        ↓
AI 中文配音
        ↓
动态中文字幕
        ↓
Remotion 动画与信息卡片
        ↓
FFmpeg 处理
        ↓
1080×1920 MP4
```

典型三分钟视频采用以下节奏：

- 0–3 秒：强钩子
- 3–20 秒：为什么值得看
- 20–140 秒：3～5 个核心知识点
- 140–165 秒：总结压缩
- 165–180 秒：形成值得收藏的结论

## 目录结构

```text
apps/studio/                 # 后续的制作与预览入口
src/ingest/                  # PDF、文章、截图、文字的输入与提取
src/research/                # 理解、核验和重点提炼
src/script/                  # 原创重构与口播脚本
src/storyboard/              # Storyboard JSON 定义与生成
src/assets/                  # 素材检索、准备和清单管理
src/voice/                   # AI 中文配音
src/subtitles/               # 动态中文字幕数据
src/render/                  # Remotion 与 FFmpeg 渲染流程
src/shared/                  # 跨模块共享类型和工具
templates/knowledge/         # 第一版 Knowledge 模板
templates/news/              # 预留：新闻模板
templates/ranking/           # 预留：排行模板
templates/comparison/        # 预留：对比模板
prompts/                     # 版本化提示词
assets/music/                # 音乐资源
assets/branding/             # 品牌视觉资源
docs/superpowers/specs/      # 正式设计文档
output/                      # 本地任务产物，不提交生成文件
```

## 任务产物与可恢复执行

每次任务使用独立的 `job-id`，并保存完整中间结果：

```text
output/<job-id>/
├── source.json
├── analysis.json
├── script.json
├── storyboard.json
├── voice.mp3
├── subtitles.json
├── assets.json
└── final.mp4
```

这些产物构成阶段缓存。修改画面时可以从 `storyboard.json` 或渲染阶段继续执行，无需重新生成分析、脚本和配音；修改口播时也只需重跑受影响的下游阶段。

## 第二阶段最小链路

当前 Demo 使用仓库内固定的原创中文 `sample-storyboard.json`，用于证明以下核心路径稳定：

```text
Storyboard JSON → Schema 校验 → Remotion → 1080×1920 H.264 MP4
```

运行环境要求 Node.js 22.20.0 或兼容版本。首次安装和渲染可能下载 Remotion 使用的 Chromium：

```bash
npm install
npm run preview
npm test
npm run render:demo
```

- `npm run preview` 启动 Remotion Studio；因为使用 `--no-open`，请打开终端输出的本地 URL。
- `npm test` 运行 Storyboard Schema、时间轴、任务产物和真实 MP4 渲染冒烟测试。
- `npm run render:demo` 渲染固定 24 秒、30fps 的 Demo，成片位于 `output/knowledge-demo/final.mp4`。
- Demo 的八项中间产物均保存在 `output/knowledge-demo/`，可用于后续局部重跑。

本阶段未配置 OpenAI、Gemini、OCR、真实 TTS、素材搜索或自动发布 API。`voice.mp3` 是明确标记、且不混入成片的静音占位音轨，不能视为真实中文配音。

## 未来使用方式

后续阶段会逐步补齐可单独运行、可恢复的上游流水线模块。预期使用方式是：创建任务并导入资料，审阅分析和脚本，确认 Storyboard，准备素材与配音，最后复用当前渲染链路生成 MP4。每个阶段都读取上游 JSON 并写入自己的产物，以便人工审阅、局部修改和失败重试。

第一版只实现 Knowledge 知识型模板。在核心生产链稳定之前，不开发登录、付费、SaaS 后台或多平台自动发布。

完整架构与数据约定见 [设计文档](docs/superpowers/specs/2026-08-11-ai-video-factory-design.md)。
