import type {AccentNameSchema} from "../../storyboard/visual-schema";
import type {z} from "zod";

export type AccentName = z.infer<typeof AccentNameSchema>;
export type CanvasTone = "ink" | "paper";

const accents: Record<AccentName, string> = {
  vermilion: "#e5634f",
  indigo: "#65758b",
  moss: "#5f806b",
  gold: "#c7a84f",
};

const canvases = {
  ink: {
    background: "#101216",
    foreground: "#f3f0e8",
    muted: "#a7a9ad",
    panel: "#1b1e24",
  },
  paper: {
    background: "#f1eee5",
    foreground: "#17191d",
    muted: "#666a70",
    panel: "#e6e1d6",
  },
} as const;

export const resolveAccent = (accent: AccentName): string => accents[accent];

export const resolveCanvasColors = (tone: CanvasTone) => canvases[tone];

export const getSceneProgress = (index: number, count: number): number => {
  if (count <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (index + 1) / count));
};
