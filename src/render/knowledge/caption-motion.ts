import type {CaptionToken} from "../../storyboard/caption-layout";

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export const getCaptionMotion = (
  frame: number,
  durationInFrames: number,
): {opacity: number; translateY: number} => {
  const entrance = clamp(frame / 8);
  const exit = clamp((durationInFrames - frame - 1) / 6);
  return {
    opacity: Math.min(entrance, exit),
    translateY: 24 * (1 - entrance),
  };
};

export const resolveCaptionTokenStyle = (
  style: CaptionToken["style"],
): {colorRole: "accent" | "foreground"; fontScale: number; fontWeight: number} => {
  switch (style) {
    case "large":
      return {colorRole: "accent", fontScale: 1.12, fontWeight: 900};
    case "accent":
      return {colorRole: "accent", fontScale: 1, fontWeight: 880};
    case "strong":
      return {colorRole: "foreground", fontScale: 1, fontWeight: 920};
    case "normal":
      return {colorRole: "foreground", fontScale: 1, fontWeight: 760};
  }
};
