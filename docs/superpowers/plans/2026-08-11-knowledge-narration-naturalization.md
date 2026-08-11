# Knowledge 中文口播自然化实施计划

## 目标

在保留 Edge TTS adapter 的前提下，将固定 Knowledge Demo 从逐场景、统一停顿的书面朗读升级为屏幕文案与口播分离、按语义段连续生成、真实词边界驱动字幕和场景的自然中文口播链路。

## 实施任务

1. 在 Storyboard 中分离 `onScreenText` 与 `voiceText`，增加 `narration.blocks`。
2. 实现确定性 speech normalization，并保护数字与货币事实标记。
3. 建立短句、句尾、知识点切换和重要结论四类 pause policy。
4. 将 Edge TTS 封装为 `VoiceProvider`，增加 `natural`、`energetic`、`calm` preset。
5. 按语义段生成连续语音，依据 WordBoundary 裁剪冗余首尾静音。
6. 将语义段边界映射回场景，继续用真实音频计算字幕和 Remotion 时间轴。
7. 加入轻量 FFmpeg 人声后处理及 `npm run voice:compare`。
8. 实际运行试听、配音、测试、渲染和媒体轨道验证后提交推送。

## 完成标准

- 默认使用 `natural`。
- 三个试听文件均为有效、非静音 MP3。
- 普通语句不再大量出现 0.6～0.9 秒冗余停顿。
- 字幕、场景和最终视频时长均由真实配音驱动。
- 最终 MP4 为 1080×1920、30fps、H.264，并包含真实音轨。
- 不引入 PDF、OCR、LLM、付费 TTS 或自动发布功能。
