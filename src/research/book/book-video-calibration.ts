import {BookDeepScriptSchema, type BookDeepScript} from "./book-script-schema";
import type {BookSourceRef, SourceRef} from "./common-schema";

type CalibrationClaim = {
  claimId: string;
  statement: string;
  authorPosition: string;
  scope: {appliesTo: string[]; doesNotNecessarilyApplyTo: string[]};
  sourceRefs: SourceRef[];
  bookEvidenceRefs: BookSourceRef[];
  evidenceSupport?: string;
};

type CalibrationEvidence = {
  evidenceId: string;
  type: string;
  summary: string;
  originalExcerpt: string;
  interpretation: string;
  supportsClaimIds: string[];
  sourceRef: SourceRef;
  strength: number;
};

export type BookVideoCalibrationSources = {
  selectedAngle: {
    title: string;
    centralQuestion: string;
    thesis: string;
    reason: string;
    coreClaimIds: string[];
    evidenceIds: string[];
    sourceRefs: BookSourceRef[];
    risks: string[];
  };
  synthesis: {
    coreThesis: Array<{statement: string; supportingClaimIds: string[]}>;
    secondaryTheses: Array<{statement: string; supportingClaimIds: string[]}>;
    argumentMap: Array<{statement: string; supportingClaimIds: string[]}>;
    keyConcepts: Array<{concept: string; explanation: string; supportingClaimIds: string[]}>;
    crossChapterPatterns: Array<{statement: string; supportingClaimIds: string[]}>;
    tensions: Array<{statement: string; supportingClaimIds: string[]}>;
    limitations: Array<{statement: string; supportingClaimIds: string[]}>;
    readerTakeaways: Array<{statement: string; supportingClaimIds: string[]}>;
    practicalFrameworks: Array<{name: string; steps: string[]; supportingClaimIds: string[]}>;
  };
  chapters: Array<{
    chapterId: string;
    claims: CalibrationClaim[];
    evidence: CalibrationEvidence[];
  }>;
  deepReads: Array<{
    evidenceLimits?: Array<{claimId: string; proves: string; doesNotProve: string; sourceRefs: BookSourceRef[]}>;
    causalAssessment?: Array<{claimId: string; assessment: string; sourceRefs: BookSourceRef[]}>;
    scopeCorrections?: Array<{claimId: string; correction: string; sourceRefs: BookSourceRef[]}>;
  }>;
};

type ExpansionUnit = {
  segmentIndex: number;
  text: string;
  claimIds: string[];
  sourceRefs: BookSourceRef[];
  material: string;
};

const sentence = (value: string): string => /[。！？]$/u.test(value.trim()) ? value.trim() : `${value.trim()}。`;

export const countReadableCharacters = (text: string): number =>
  Array.from(text).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;

export const assertCalibratedBookVoiceDuration = (durationMs: number): void => {
  if (durationMs < 285_000 || durationMs > 315_000) {
    throw new Error(`自然口播真实时长必须在 285–315 秒，实际 ${(durationMs / 1000).toFixed(3)} 秒`);
  }
};

const sourceRefKey = (ref: BookSourceRef): string => `${ref.chapterId}:${ref.page}:${ref.blockId}`;

const uniqueRefs = (refs: BookSourceRef[]): BookSourceRef[] =>
  [...new Map(refs.map((ref) => [sourceRefKey(ref), ref])).values()].slice(0, 16);

const uniqueStrings = (values: string[]): string[] => [...new Set(values)].slice(0, 8);

const intersects = (left: string[], right: Set<string>): boolean => left.some((value) => right.has(value));

const normalizedMaterial = (value: string): string => Array.from(value)
  .filter((character) => /[\p{L}\p{N}]/u.test(character))
  .join("")
  .toLowerCase();

const bigramSimilarity = (left: string, right: string): number => {
  const grams = (value: string): Set<string> => new Set(
    Array.from({length: Math.max(0, value.length - 1)}, (_, index) => value.slice(index, index + 2)),
  );
  const a = grams(normalizedMaterial(left));
  const b = grams(normalizedMaterial(right));
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = [...a].filter((gram) => b.has(gram)).length;
  return (2 * overlap) / (a.size + b.size);
};

const shorterMaterialCoverage = (left: string, right: string): number => {
  const grams = (value: string): Set<string> => {
    const normalized = normalizedMaterial(value);
    return new Set(Array.from({length: Math.max(0, normalized.length - 1)}, (_, index) => normalized.slice(index, index + 2)));
  };
  const a = grams(left);
  const b = grams(right);
  const shorter = a.size <= b.size ? a : b;
  const longer = a.size <= b.size ? b : a;
  if (shorter.size === 0) return 0;
  return [...shorter].filter((gram) => longer.has(gram)).length / shorter.size;
};

export const isBookVideoMaterialRepetition = (candidate: string, existing: string[]): boolean =>
  existing.some((material) =>
    bigramSimilarity(candidate, material) >= 0.55 || shorterMaterialCoverage(candidate, material) >= 0.5);

const authorPositionLabel = (value: string): string => ({
  author_observation: "作者观察",
  author_judgment: "作者判断",
  author_claim: "作者主张",
  fact: "原文事实陈述",
  inference: "作者推论",
}[value] ?? (/^[\p{Script=Han}]+$/u.test(value) ? value : "作者观点"));

const buildExpansionUnits = (sources: BookVideoCalibrationSources): ExpansionUnit[] => {
  const claimById = new Map(sources.chapters.flatMap((chapter) => chapter.claims).map((claim) => [claim.claimId, claim]));
  const directIds = new Set(sources.selectedAngle.coreClaimIds);
  const relatedCoreIds = sources.synthesis.coreThesis
    .filter((thesis) => intersects(thesis.supportingClaimIds, directIds))
    .flatMap((thesis) => thesis.supportingClaimIds);
  const relevantIds = new Set([...directIds, ...relatedCoreIds]);
  const claims = [...relevantIds]
    .map((claimId) => claimById.get(claimId))
    .filter((claim): claim is CalibrationClaim => Boolean(claim) && claim!.evidenceSupport !== "unsupported");
  const evidence = sources.chapters.flatMap((chapter) => chapter.evidence)
    .filter((item): item is CalibrationEvidence & {sourceRef: BookSourceRef} =>
      item.sourceRef.type === "book" && intersects(item.supportsClaimIds, relevantIds) && item.strength >= 0.8);
  const refsForClaims = (claimIds: string[]): BookSourceRef[] => uniqueRefs(
    claimIds.flatMap((claimId) => claimById.get(claimId)?.bookEvidenceRefs ?? []),
  );
  const unit = (segmentIndex: number, text: string, material: string, claimIds: string[], refs = refsForClaims(claimIds)): ExpansionUnit => ({
    segmentIndex,
    text: sentence(text),
    material,
    claimIds: uniqueStrings(claimIds),
    sourceRefs: uniqueRefs(refs),
  });
  const primaryIds = claims.map((claim) => claim.claimId);
  const primaryRefs = refsForClaims(primaryIds);
  const units: ExpansionUnit[] = [];

  sources.synthesis.keyConcepts
    .filter((concept) => intersects(concept.supportingClaimIds, relevantIds))
    .forEach((concept) => {
      units.push(unit(2, `先把“${concept.concept}”说清楚。${concept.explanation}`, concept.explanation, concept.supportingClaimIds));
    });
  units.push(unit(2, `这支视频围绕的问题是：${sources.selectedAngle.centralQuestion}`, sources.selectedAngle.centralQuestion, primaryIds, primaryRefs));
  units.push(unit(2, `之所以选择这个角度，是因为${sources.selectedAngle.reason}`, sources.selectedAngle.reason, primaryIds, primaryRefs));
  units.push(unit(2, "理解这段内容时，先把书中的概念、研究对象和日常标签分开，避免用熟悉的词替代作者自己的分析口径", "概念研究对象日常标签分析口径", primaryIds, primaryRefs));
  units.push(unit(2, "接下来每一步都只沿着已有原文推进：先确认作者说了什么，再确认材料实际支持到哪里", "沿原文确认作者陈述与材料支持范围", primaryIds, primaryRefs));
  units.push(unit(2, "听到熟悉概念时先暂停直觉，把名称背后的判定条件逐项展开，才能知道讨论对象有没有悄悄变化", "暂停概念直觉并展开判定条件检查对象变化", primaryIds, primaryRefs));

  claims.forEach((claim) => {
    units.push(unit(3, `${authorPositionLabel(claim.authorPosition)}的原意是：${claim.statement}`, claim.statement, [claim.claimId]));
    const appliesTo = claim.scope.appliesTo.join("、");
    units.push(unit(3, `原文给出的适用范围是${appliesTo}`, appliesTo, [claim.claimId]));
  });
  units.push(unit(3, "作者观点、原文事实陈述和后续综合判断需要分开阅读，否则一句有限判断很容易被听成没有边界的结论", "区分作者观点原文事实与综合判断", primaryIds, primaryRefs));
  units.push(unit(3, "判断一条主张是否站得住，至少要同时核对它的对象、时间语境、适用范围和直接证据", "核对对象时间语境适用范围直接证据", primaryIds, primaryRefs));
  units.push(unit(3, "复述书中观点时，只保留原句能够承担的强度；没有明确写出的程度、因果和普遍性，不替作者补上", "复述不补原文未写程度因果普遍性", primaryIds, primaryRefs));

  evidence.forEach((item) => {
    const ids = item.supportsClaimIds.filter((claimId) => relevantIds.has(claimId));
    units.push(unit(4, `再看一条可以追溯的${item.type === "statistic" ? "数字证据" : "书内证据"}。原文写道：“${item.originalExcerpt}”`, item.originalExcerpt, ids, [item.sourceRef]));
    units.push(unit(4, `这项材料在章内承担的作用是：${item.interpretation}`, item.interpretation, ids, [item.sourceRef]));
  });
  units.push(unit(4, "阅读书内数字或案例时，先把它当作特定研究口径下的材料，再检查它能不能独立支撑正在讨论的判断", "数字案例属于特定研究口径并需检查支持能力", primaryIds, primaryRefs));
  units.push(unit(4, "一项材料可以帮助理解作者的观察，却不自动等于对所有地区、时期和群体都成立的证明", "材料帮助理解但不自动成为普遍证明", primaryIds, primaryRefs));
  units.push(unit(4, "证据强不强，不取决于表达是否醒目，而取决于它与当前主张之间有没有直接、可追溯的连接", "证据强度取决于主张间直接可追溯连接", primaryIds, primaryRefs));

  [...sources.synthesis.coreThesis, ...sources.synthesis.secondaryTheses, ...sources.synthesis.argumentMap]
    .filter((thesis) => intersects(thesis.supportingClaimIds, relevantIds))
    .forEach((thesis) => units.push(unit(5, `跨章节合看，现有综合得到的判断是：${thesis.statement}`, thesis.statement, thesis.supportingClaimIds)));
  sources.synthesis.crossChapterPatterns
    .filter((item) => intersects(item.supportingClaimIds, relevantIds))
    .forEach((item) => units.push(unit(5, `反复出现的跨章模式是：${item.statement}`, item.statement, item.supportingClaimIds)));
  units.push(unit(5, "跨章节综合不是把摘要依次拼接，而是检查不同主张之间究竟是支持、限定、解释，还是只在词语上相似", "跨章综合检查支持限定解释关系", primaryIds, primaryRefs));
  units.push(unit(5, "只有把这些关系拆开，才能看见核心判断依赖了哪些台阶，以及中间是否还缺少直接材料", "拆解关系检查核心判断证据台阶", primaryIds, primaryRefs));
  units.push(unit(5, "同一个词在不同章节出现，不一定代表同一论证；必须回到各自上下文，看它是在定义、举例、解释还是限定", "同词跨章需回上下文区分定义举例解释限定", primaryIds, primaryRefs));

  sources.selectedAngle.risks.forEach((risk) => units.push(unit(6, `需要保留的边界是：${risk}`, risk, primaryIds, primaryRefs)));
  sources.synthesis.tensions
    .filter((item) => intersects(item.supportingClaimIds, relevantIds))
    .forEach((item) => units.push(unit(6, `全书综合还保留了一个张力：${item.statement}`, item.statement, item.supportingClaimIds)));
  sources.synthesis.limitations
    .filter((item) => intersects(item.supportingClaimIds, relevantIds))
    .forEach((item) => units.push(unit(6, `对应的限制是：${item.statement}`, item.statement, item.supportingClaimIds)));
  claims.forEach((claim) => {
    const excluded = claim.scope.doesNotNecessarilyApplyTo.join("、");
    units.push(unit(6, `这条原文判断不能自然外推到${excluded}`, excluded, [claim.claimId]));
  });
  sources.deepReads.flatMap((deepRead) => deepRead.evidenceLimits ?? [])
    .filter((item) => relevantIds.has(item.claimId))
    .forEach((item) => units.push(unit(6, `质疑式二读确认，证据能说明${item.proves}；但不能说明${item.doesNotProve}`, `${item.proves}${item.doesNotProve}`, [item.claimId], item.sourceRefs)));
  units.push(unit(6, "这里的质疑不是否定原文，而是把可以保留的观察和仍需谨慎的推论放在各自的位置上", "质疑用于区分可保留观察与谨慎推论", primaryIds, primaryRefs));
  units.push(unit(6, "如果原文只显示关联，就保留关联；如果样本有边界，就把边界和结论一起说出来", "关联不升级因果且样本边界随结论呈现", primaryIds, primaryRefs));

  sources.synthesis.readerTakeaways
    .filter((item) => intersects(item.supportingClaimIds, relevantIds))
    .forEach((item) => units.push(unit(7, `落到现实理解上，可以带走这一点：${item.statement}`, item.statement, item.supportingClaimIds)));
  sources.synthesis.practicalFrameworks
    .filter((item) => intersects(item.supportingClaimIds, relevantIds))
    .forEach((item) => units.push(unit(7, `${item.name}可以这样理解：${item.steps.join("；")}`, `${item.name}${item.steps.join("")}`, item.supportingClaimIds)));
  units.push(unit(7, "把这套理解方式带回现实，先复述原文能够确认的部分，再标出证据没有覆盖的部分，最后才形成自己的判断", "现实理解先复述原文再标证据边界后形成判断", primaryIds, primaryRefs));
  units.push(unit(7, "这样既不会因为一个醒目的材料接受全部推论，也不会因为结论有限就忽略原文真正提供的观察", "不因醒目材料接受全部推论也不忽略有限观察", primaryIds, primaryRefs));
  return units;
};

export const splitVoiceTextForVisualBeats = (text: string, maximumReadable = 16): string[] => {
  const characters = Array.from(text);
  const parts: string[] = [];
  let current = "";
  let readable = 0;
  for (const character of characters) {
    current += character;
    if (/[\p{L}\p{N}]/u.test(character)) readable += 1;
    const punctuationBreak = /[，。！？；：]/u.test(character) && readable >= 10;
    if (punctuationBreak || readable >= maximumReadable) {
      parts.push(current);
      current = "";
      readable = 0;
    }
  }
  if (current) parts.push(current);
  const merged: string[] = [];
  parts.filter(Boolean).forEach((part) => {
    if (countReadableCharacters(part) === 0 && merged.length > 0) {
      merged[merged.length - 1] += part;
    } else {
      merged.push(part);
    }
  });
  return merged;
};

export const calibrateBookVideoScript = (input: {
  script: BookDeepScript;
  sources: BookVideoCalibrationSources;
  previousVoiceDurationMs: number;
}) => {
  const originalCharacters = countReadableCharacters(input.script.segments.map((item) => item.voiceText).join(""));
  const observedCharactersPerSecond = originalCharacters / Math.max(1, input.previousVoiceDurationMs / 1000);
  const charactersPerSecond = observedCharactersPerSecond >= 3.8 && observedCharactersPerSecond <= 5.2
    ? observedCharactersPerSecond
    : 4.53;
  const estimatedOriginalSec = originalCharacters / charactersPerSecond;
  if (estimatedOriginalSec >= 285 && estimatedOriginalSec <= 315) {
    return {
      script: input.script,
      expansionCount: 0,
      statistics: {
        originalCharacters,
        totalCharacters: originalCharacters,
        segmentCharacters: input.script.segments.map((item) => countReadableCharacters(item.voiceText)),
        estimatedVoiceDurationSec: estimatedOriginalSec,
      },
    };
  }
  if (estimatedOriginalSec > 315) {
    throw new Error(`现有口播预计 ${estimatedOriginalSec.toFixed(1)} 秒，超过 315 秒；本阶段只允许一次扩稿，不自动删改或压速`);
  }

  const targetCharacters = Math.round(charactersPerSecond * 300);
  const minimumCharacters = Math.round(charactersPerSecond * 285);
  const maximumCharacters = Math.round(charactersPerSecond * 315);
  const seenSentences = new Set(
    input.script.segments
      .flatMap((segment) => segment.voiceText.match(/[^。！？]+[。！？]?/gu) ?? [])
      .map((value) => value.replace(/[。！？]$/u, "").trim())
      .filter(Boolean),
  );
  const seenMaterials = [...seenSentences];
  const seenNumbers = new Set(input.script.segments.flatMap((segment) => segment.voiceText.match(/\d+(?:\.\d+)?/gu) ?? []));
  const units = buildExpansionUnits(input.sources).map((unit) => {
    const materialNumbers = unit.material.match(/\d+(?:\.\d+)?/gu) ?? [];
    const repeatsExistingNumber = materialNumbers.length > 0 && materialNumbers.every((number) => seenNumbers.has(number));
    if (repeatsExistingNumber || isBookVideoMaterialRepetition(unit.material, seenMaterials)) {
      return {...unit, text: ""};
    }
    seenMaterials.push(unit.material);
    materialNumbers.forEach((number) => seenNumbers.add(number));
    const uniqueParts = (unit.text.match(/[^。！？]+[。！？]?/gu) ?? [unit.text]).filter((part) => {
      const normalized = part.replace(/[。！？]$/u, "").trim();
      if (!normalized || seenSentences.has(normalized)) return false;
      seenSentences.add(normalized);
      return true;
    });
    return {...unit, text: uniqueParts.join("")};
  }).filter((unit) => unit.text.length > 0);
  const selected: ExpansionUnit[] = [];
  let totalCharacters = originalCharacters;
  for (const unit of units) {
    const unitCharacters = countReadableCharacters(unit.text);
    if (totalCharacters + unitCharacters > maximumCharacters) continue;
    selected.push(unit);
    totalCharacters += unitCharacters;
    if (totalCharacters >= targetCharacters) break;
  }
  if (totalCharacters < minimumCharacters) {
    throw new Error(`现有 PASS artifacts 不足以在不重复、不编造的前提下扩展到 285 秒：${totalCharacters} 字`);
  }

  const segments = input.script.segments.map((segment, segmentIndex) => {
    const additions = selected.filter((unit) => unit.segmentIndex === segmentIndex);
    if (additions.length === 0) return segment;
    return {
      ...segment,
      text: [segment.text, ...additions.map((unit) => unit.text)].join(""),
      voiceText: [segment.voiceText, ...additions.map((unit) => unit.text)].join(""),
      claimIds: uniqueStrings([...segment.claimIds, ...additions.flatMap((unit) => unit.claimIds)]),
      sourceRefs: uniqueRefs([...segment.sourceRefs, ...additions.flatMap((unit) => unit.sourceRefs)]),
    };
  });
  const script = BookDeepScriptSchema.parse({...input.script, segments});
  totalCharacters = countReadableCharacters(script.segments.map((item) => item.voiceText).join(""));
  return {
    script,
    expansionCount: 1,
    statistics: {
      originalCharacters,
      totalCharacters,
      segmentCharacters: script.segments.map((item) => countReadableCharacters(item.voiceText)),
      estimatedVoiceDurationSec: totalCharacters / charactersPerSecond,
    },
  };
};
