export type CaptionEmphasis = {
  text: string;
  style: "accent" | "strong" | "large";
};

export type CaptionToken = {
  text: string;
  style: CaptionEmphasis["style"] | "normal";
};

const MAX_LINE_CHARACTERS = 10;
const BREAK_PUNCTUATION = new Set(["，", "。", "！", "？", "；", "：", "、"]);

export const countReadableCharacters = (text: string): number =>
  Array.from(text).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;

export const layoutChineseCaption = (text: string): string[] => {
  const characters = Array.from(text.trim());
  if (characters.length <= MAX_LINE_CHARACTERS) {
    return [characters.join("")];
  }
  if (characters.length > MAX_LINE_CHARACTERS * 2) {
    throw new Error("字幕无法在两行安全区内展示");
  }

  const punctuationBreaks = characters
    .map((character, index) => (BREAK_PUNCTUATION.has(character) ? index + 1 : -1))
    .filter(
      (index) =>
        index >= 3 &&
        index <= MAX_LINE_CHARACTERS &&
        characters.length - index <= MAX_LINE_CHARACTERS,
    );
  const halfway = characters.length / 2;
  const breakAt = punctuationBreaks.sort(
    (left, right) => Math.abs(left - halfway) - Math.abs(right - halfway),
  )[0] ?? MAX_LINE_CHARACTERS;

  return [
    characters.slice(0, breakAt).join(""),
    characters.slice(breakAt).join(""),
  ];
};

export const tokenizeCaptionLine = (
  line: string,
  emphasis: CaptionEmphasis[],
): CaptionToken[] => {
  const ranges = emphasis
    .map((item) => {
      const start = line.indexOf(item.text);
      return {start, end: start + item.text.length, item};
    })
    .filter((range) => range.start >= 0)
    .sort((left, right) => left.start - right.start);
  const tokens: CaptionToken[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start < cursor) {
      continue;
    }
    if (range.start > cursor) {
      tokens.push({text: line.slice(cursor, range.start), style: "normal"});
    }
    tokens.push({text: range.item.text, style: range.item.style});
    cursor = range.end;
  }
  if (cursor < line.length) {
    tokens.push({text: line.slice(cursor), style: "normal"});
  }

  return tokens;
};
