type NormalizeSpeechOptions = {
  transform?: (text: string) => string;
  protectedTerms?: string[];
};

export type NormalizedSpeech = {
  sourceText: string;
  text: string;
  clauses: string[];
  changes: string[];
};

const factTokens = (text: string): string[] =>
  text.match(/\d+(?:[.,]\d+)?%?|日元|人民币|美元|欧元|英镑|港元|新台币/gu) ?? [];

const splitClauses = (text: string): string[] => {
  const clauses = text.match(/[^。！？；]+[。！？；]?/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
  for (const clause of clauses) {
    const readableLength = Array.from(clause).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
    if (readableLength > 42 && !/[，、：]/u.test(clause)) {
      throw new Error("口播句子过长且没有安全断句标点，请人工拆分 voiceText");
    }
  }
  return clauses;
};

const normalizeList = (source: string, changes: string[]): string => {
  const lines = source.split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  const parsed = lines.map((line) => /^(?:\d+[.、)]|[一二三四五六七八九十]+[、.]|[-•])\s*(.+)$/u.exec(line));
  if (lines.length < 2 || parsed.some((match) => !match)) return source;
  changes.push("remove-list-markers");
  return parsed.map((match, index) => {
    let content = match![1]!.trim();
    const hasConnector = /^(?:先|接着|然后|最后|此外|另外|因此|所以|但|然而)/u.test(content);
    if (index > 0 && !hasConnector) {
      content = `${index === parsed.length - 1 ? "最后" : "接着"}，${content}`;
    }
    return /[。！？；]$/u.test(content) ? content : `${content}。`;
  }).join("");
};

const splitOverlongSentences = (text: string, changes: string[]): string => {
  const sentences = text.match(/[^。！？；]+[。！？；]?/gu) ?? [text];
  let changed = false;
  const result = sentences.map((sentence) => {
    const readable = Array.from(sentence).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
    if (readable <= 42) return sentence;
    const pieces = sentence.split(/，/u);
    if (pieces.length < 2) return sentence;
    changed = true;
    let current = "";
    const groups: string[] = [];
    for (const piece of pieces) {
      const candidate = current ? `${current}，${piece}` : piece;
      const length = Array.from(candidate).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
      if (current && length > 32) {
        groups.push(current.replace(/[。！？；]$/u, ""));
        current = piece;
      } else {
        current = candidate;
      }
    }
    if (current) groups.push(current);
    const terminal = /[。！？；]$/u.exec(sentence)?.[0] ?? "。";
    return `${groups.map((group) => group.replace(/[。！？；]$/u, "")).join("。")} `.trimEnd().replace(/\s/u, "")
      .replace(/[。！？；]?$/u, terminal);
  }).join("");
  if (changed) changes.push("split-long-sentences");
  return result;
};

const defaultTransform = (source: string, changes: string[]): string => {
  let text = normalizeList(source.trim(), changes);
  const withoutMarkers = text.replace(/(^|\n)\s*(?:\d+[.、)]|[一二三四五六七八九十]+[、.]|[-•])\s*/gu, "$1");
  if (withoutMarkers !== text && !changes.includes("remove-list-markers")) changes.push("remove-list-markers");
  text = withoutMarkers;

  const connectorReplacements: Array<[RegExp, string]> = [
    [/因此/gu, "所以"],
    [/此外/gu, "另外"],
    [/然而/gu, "但"],
  ];
  const replaced = connectorReplacements.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text,
  );
  if (replaced !== text) changes.push("replace-written-connectors");
  text = replaced;

  const normalized = text
    .replace(/[ \t]+/gu, " ")
    .replace(/\s*\n+\s*/gu, "")
    .replace(/\s*([，。！？；：、])/gu, "$1")
    .replace(/([，。！？；：、])\s*/gu, "$1")
    .replace(/([。！？])\1+/gu, "$1")
    .trim();
  if (normalized !== text) changes.push("normalize-punctuation");
  return splitOverlongSentences(normalized, changes);
};

export const normalizeSpeechText = (
  sourceText: string,
  options: NormalizeSpeechOptions = {},
): NormalizedSpeech => {
  if (!sourceText.trim()) throw new Error("voiceText 不能为空");
  const changes: string[] = [];
  const text = options.transform
    ? options.transform(sourceText)
    : defaultTransform(sourceText, changes);
  const semanticSource = sourceText.replace(
    /(^|\n)\s*(?:\d+[.、)]|[一二三四五六七八九十]+[、.]|[-•])\s*/gu,
    "$1",
  );
  const beforeFacts = factTokens(semanticSource);
  const afterFacts = factTokens(text);
  if (JSON.stringify(beforeFacts) !== JSON.stringify(afterFacts)) {
    throw new Error("口播规范化改变了数字或货币事实标记");
  }
  for (const term of options.protectedTerms ?? []) {
    if (sourceText.includes(term) && !text.includes(term)) {
      throw new Error(`口播规范化丢失保护词：${term}`);
    }
  }
  return {sourceText, text, clauses: splitClauses(text), changes};
};
