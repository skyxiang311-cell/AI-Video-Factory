# Knowledge 真实配音与时间轴实施记录

## 范围

第三阶段 3.1 只实现原创学习方法 Demo 的真实中文配音、音频驱动字幕和动态视频时间轴，不接入 PDF、OCR、内容模型、素材搜索或自动发布。

## 已实现链路

1. TypeScript `EdgeTtsAdapter` 通过项目内 Python bridge 调用锁定版本 `edge-tts==7.2.8`。
2. 每幕 `voiceText` 独立生成 MP3 与 WordBoundary，React 不包含口播内容。
3. FFmpeg 将分幕音频、头尾留白和幕间停顿合并为 `voice.mp3`。
4. Mediabunny 读取真实音频时长和媒体轨道。
5. Storyboard resolver 生成 V1.2 场景、口播和字幕时间轴。
6. Edge 词边界不可靠时，按实际音频时长启用确定性字幕回退。
7. Remotion 使用 `@remotion/media` 加载真实音轨，以动态总时长计算帧数。
8. 渲染后检查 H.264、1080×1920、30fps、音视频轨、时长、字幕边界、非静音配音和完整解码。

## 命令

```bash
npm run voice:demo
npm test
npm run render:demo
```

生成目录为 `output/knowledge-voice-demo/`，所有生成文件继续由 `.gitignore` 排除。
