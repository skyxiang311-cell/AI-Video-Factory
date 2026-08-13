import type {BookDeepScript} from "./book-script-schema";
import {alignSceneCaptions} from "../../subtitles/voice-caption-alignment";
import {parseVisualStoryboard, type VisualScene, type VisualStoryboard} from "../../storyboard/visual-schema";

type ScriptSegment = BookDeepScript["segments"][number];
type Purpose = ScriptSegment["purpose"];

const chars = (value: string, maximum: number): string =>
  Array.from(value.trim()).slice(0, maximum).join("");

const visualTerms = (text: string, count: number): string[] => {
  const terms = [...new Set(text
    .split(/[，。！？；：、]/u)
    .map((value) => value.replace(/^(?:作者|书中|我们|这一|例如|此外|但是|但|然而)/u, "").trim())
    .filter((value) => Array.from(value).length >= 2)
    .map((value) => chars(value, 14)))];
  const fallback = chars(text.replace(/[，。！？；：、]/gu, ""), 14);
  while (terms.length < count) terms.push(terms.at(-1) ?? fallback);
  return terms.slice(0, count);
};

const extractMetrics = (text: string) => [...text.matchAll(/(\d+(?:\.\d+)?)\s*(万元|万|%|元)?/gu)]
  .slice(0, 3)
  .map((match, index, matches) => {
    const raw = match[1]!;
    return {
      value: Number(raw),
      decimals: raw.includes(".") ? Math.min(2, raw.split(".")[1]!.length) : 0,
      prefix: "",
      suffix: match[2] ?? "",
      label: matches.length === 1 ? "原文关键数值" : index === 0 ? "区间下限" : index === 1 ? "区间上限" : "相关数值",
      icon: "arrow" as const,
    };
  });

const shortHook = (text: string): [string, string] => {
  const characters = Array.from(text);
  const limit = Math.min(10, characters.length);
  let splitAt = -1;
  for (let index = 0; index < limit; index += 1) {
    if (/[，。！？；：]/u.test(characters[index]!)) splitAt = index + 1;
  }
  if (splitAt < 1) splitAt = Math.min(8, characters.length);
  return [characters.slice(0, splitAt).join(""), characters.slice(splitAt).join("")];
};

const resolvePurpose = (purpose: Purpose): VisualScene["purpose"] => {
  if (purpose === "primary_hook") return "hook";
  if (purpose === "hook_extension" || purpose === "audience_relevance") return "context";
  if (purpose === "memorable_ending") return "summary";
  return "knowledge";
};

const sourceNoteFor = (segments: ScriptSegment[]): string | undefined => {
  if (!segments.some((segment) => segment.visibleSourceRequired)) return undefined;
  const pages = [...new Set(segments.flatMap((segment) => segment.sourceRefs.map((ref) => ref.page)))].sort((a, b) => a - b);
  if (pages.length === 1) return `原书第${pages[0]}页`;
  if (pages.length <= 4) return `原书第${pages.join("、")}页`;
  return `原书第${pages[0]}—${pages.at(-1)}页（共${pages.length}页）`;
};

const sceneBase = (
  id: string,
  segments: ScriptSegment[],
  voiceText: string,
  startMs: number,
  endMs: number,
  onScreenText: string[],
  visualIntent: string,
): Omit<VisualScene, "visualType" | "visualData"> => ({
  id,
  startMs,
  endMs,
  purpose: resolvePurpose(segments[0]!.purpose),
  voiceText,
  onScreenText,
  visualIntent,
  assetRefs: [],
  sourceRefs: segments.flatMap((segment) => segment.sourceRefs),
  sourceNote: sourceNoteFor(segments),
  emphasis: onScreenText.slice(0, 2).map((text) => chars(text, 12)),
  contentFlags: [],
  transition: id === "scene-primary-hook" ? "cut" : "fade",
  transitionDurationMs: id === "scene-primary-hook" ? 0 : 360,
});

const buildScenes = (script: BookDeepScript): VisualScene[] => {
  const [primaryHook, hookRemainder] = shortHook(script.segments[0]!.voiceText);
  const segment = (index: number) => script.segments[index]!;
  const terms = (index: number, count: number) => visualTerms(segment(index).text, count);
  const scenes: VisualScene[] = [];

  scenes.push({
    ...sceneBase("scene-primary-hook", [segment(0)], primaryHook, 0, 3000,
      [chars(script.centralQuestion, 22)], "以中心问题和反差动效在前三秒建立注意力"),
    visualType: "hook",
    visualData: {
      headline: chars(script.centralQuestion, 30),
      supporting: "先别急着接受直觉答案",
      highlight: chars(primaryHook.replace(/[，。！？]/gu, ""), 16),
      motif: "question",
      accent: "vermilion",
      tone: "ink",
    },
  });

  const hookExtensionVoice = hookRemainder + segment(1).voiceText;
  const hookTerms = visualTerms(hookExtensionVoice, 2);
  scenes.push({
    ...sceneBase("scene-hook-extension", [segment(0), segment(1)], hookExtensionVoice, 3000, 8000,
      hookTerms, "用左右对照延续悬念而非堆叠字幕"),
    purpose: "context",
    visualType: "comparison",
    visualData: {
      title: chars(script.centralQuestion, 26),
      mode: "a-b",
      accent: "gold",
      tone: "ink",
      left: {label: "问题", headline: chars(hookTerms[0]!, 18), points: [chars(hookTerms[0]!, 18)], icon: "search"},
      right: {label: "线索", headline: chars(hookTerms[1]!, 18), points: [chars(hookTerms[1]!, 18)], icon: "arrow"},
    },
  });

  scenes.push({
    ...sceneBase("scene-audience-relevance", [segment(2)], segment(2).voiceText, 8000, 30000,
      terms(2, 3), "以关系图说明议题为何与普通人有关"),
    visualType: "diagram",
    visualData: {
      title: "为什么这件事与你有关",
      layout: "horizontal-flow",
      accent: "indigo",
      tone: "paper",
      nodes: [
        {id: "context", label: terms(2, 3)[0]!, icon: "book"},
        {id: "meaning", label: terms(2, 3)[1]!, icon: "brain"},
        {id: "relevance", label: terms(2, 3)[2]!, icon: "check"},
      ],
      edges: [{from: "context", to: "meaning"}, {from: "meaning", to: "relevance"}],
    },
  });

  scenes.push({
    ...sceneBase("scene-author-judgment", [segment(3)], segment(3).voiceText, 30000, 75000,
      terms(3, 2), "以结构对比呈现作者的核心判断"),
    visualType: "comparison",
    visualData: {
      title: "作者的核心判断",
      mode: "a-b",
      accent: "moss",
      tone: "paper",
      left: {label: "前提", headline: chars(terms(3, 2)[0]!, 18), points: [chars(terms(3, 2)[0]!, 18)], icon: "book"},
      right: {label: "判断", headline: chars(terms(3, 2)[1]!, 18), points: [chars(terms(3, 2)[1]!, 18)], icon: "check"},
    },
  });

  const metrics = extractMetrics(segment(4).text);
  if (metrics.length > 0) {
    scenes.push({
      ...sceneBase("scene-strongest-evidence", [segment(4)], segment(4).voiceText, 75000, 145000,
        metrics.map((metric) => metric.label), "将原文关键数字转化为动态数据卡并显示必要来源"),
      visualType: "stat",
      visualData: {
        title: "原文中的关键数值",
        mode: metrics.length === 1 ? "single" : "ratio",
        accent: "vermilion",
        tone: "ink",
        metrics,
      },
    });
  } else {
    const evidenceTerms = terms(4, 3);
    scenes.push({
      ...sceneBase("scene-strongest-evidence", [segment(4)], segment(4).voiceText, 75000, 145000,
        evidenceTerms, "将最强证据拆成关系图并显示必要来源"),
      visualType: "diagram",
      visualData: {
        title: "最强证据",
        layout: "horizontal-flow",
        accent: "vermilion",
        tone: "ink",
        nodes: evidenceTerms.map((label, index) => ({id: `evidence-${index + 1}`, label, icon: index === 2 ? "check" as const : "book" as const})),
        edges: [{from: "evidence-1", to: "evidence-2"}, {from: "evidence-2", to: "evidence-3"}],
      },
    });
  }

  scenes.push({
    ...sceneBase("scene-second-layer", [segment(5)], segment(5).voiceText, 145000, 200000,
      terms(5, 3), "用多因素关系图呈现第二层机制"),
    visualType: "diagram",
    visualData: {
      title: "第二层机制",
      layout: "relation",
      accent: "gold",
      tone: "paper",
      nodes: [
        {id: "factor-a", label: terms(5, 3)[0]!, icon: "bookmark"},
        {id: "factor-b", label: terms(5, 3)[1]!, icon: "shuffle"},
        {id: "factor-c", label: terms(5, 3)[2]!, icon: "brain"},
        {id: "relation", label: "共同关联", detail: "不越过原文", icon: "check"},
      ],
      edges: [
        {from: "factor-a", to: "relation"},
        {from: "factor-b", to: "relation"},
        {from: "factor-c", to: "relation"},
      ],
    },
  });

  scenes.push({
    ...sceneBase("scene-critical-turn", [segment(6)], segment(6).voiceText, 200000, 245000,
      terms(6, 2), "以证据边界对比呈现 Phase 3C 质疑"),
    visualType: "comparison",
    visualData: {
      title: "重要的边界在哪里",
      mode: "a-b",
      accent: "vermilion",
      tone: "ink",
      left: {label: "原文", headline: chars(terms(6, 2)[0]!, 18), points: [chars(terms(6, 2)[0]!, 18)], icon: "check"},
      right: {label: "边界", headline: chars(terms(6, 2)[1]!, 18), points: [chars(terms(6, 2)[1]!, 18)], icon: "close"},
    },
  });

  scenes.push({
    ...sceneBase("scene-system-judgment", [segment(7)], segment(7).voiceText, 245000, 285000,
      terms(7, 3), "明确区分作者观点与系统判断"),
    visualType: "diagram",
    visualData: {
      title: "我们的判断，多走一步",
      layout: "horizontal-flow",
      accent: "indigo",
      tone: "paper",
      nodes: [
        {id: "author", label: terms(7, 3)[0]!, detail: "书内观点", icon: "book"},
        {id: "limit", label: terms(7, 3)[1]!, detail: "不越过证据", icon: "search"},
        {id: "insight", label: terms(7, 3)[2]!, detail: "现实启示", icon: "brain"},
      ],
      edges: [{from: "author", to: "limit", label: "审视"}, {from: "limit", to: "insight", label: "再判断"}],
    },
  });

  scenes.push({
    ...sceneBase("scene-memorable-ending", [segment(8)], segment(8).voiceText, 285000, 300000,
      terms(8, 3), "以三个记忆锚点和结论卡收束"),
    visualType: "summary",
    visualData: {
      title: "把这句话带走",
      accent: "gold",
      tone: "ink",
      items: [
        {label: chars(terms(8, 3)[0]!, 18), icon: "shuffle"},
        {label: chars(terms(8, 3)[1]!, 18), icon: "check"},
        {label: chars(terms(8, 3)[2]!, 18), icon: "brain"},
      ],
      closing: chars(segment(8).text, 28),
    },
  });

  return scenes;
};

export const buildBookVideoStoryboard = (jobId: string, script: BookDeepScript): VisualStoryboard => {
  const scale = script.durationSec / 300;
  const scenes = buildScenes(script).map((scene, index, all) => ({
    ...scene,
    startMs: index === 0 ? 0 : index === 1 ? 3000 : Math.round(scene.startMs * scale),
    endMs: index === 0 ? 3000 : index === all.length - 1 ? script.durationSec * 1000 : Math.round(scene.endMs * scale),
  }));
  const captions = scenes.flatMap((scene) => alignSceneCaptions({
    sceneId: scene.id,
    text: scene.voiceText,
    speechStartMs: scene.startMs,
    speechEndMs: scene.endMs,
    emphasis: scene.emphasis,
    boundaries: [],
  }));
  return parseVisualStoryboard({
    schemaVersion: "1.2",
    jobId,
    format: {width: 1080, height: 1920, fps: 30, durationMs: script.durationSec * 1000},
    template: "knowledge",
    profile: "book-deep-reading",
    branding: {enabled: true, label: "BOOK DEEP READING", position: "top-left"},
    narration: {
      preset: "natural",
      blocks: scenes.map((scene) => ({
        id: `speech-${scene.id.replace(/^scene-/u, "")}`,
        sceneIds: [scene.id],
        pauseAfter: scene.purpose === "summary" ? "important-conclusion" : "sentence",
      })),
    },
    audio: {enabled: false},
    scenes,
    captions,
  });
};
