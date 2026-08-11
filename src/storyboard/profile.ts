import {z} from "zod";

export const StoryboardProfileNameSchema = z.enum([
  "knowledge-short",
  "book-deep-reading",
]);

export type StoryboardProfileName = z.infer<typeof StoryboardProfileNameSchema>;

export type StoryboardProfile = Readonly<{
  name: StoryboardProfileName;
  hardMaxDurationMs: number;
  targetMinDurationMs: number;
  targetMaxDurationMs: number;
  primaryHookMaxMs: number;
}>;

const PROFILES: Record<StoryboardProfileName, StoryboardProfile> = {
  "knowledge-short": {
    name: "knowledge-short",
    hardMaxDurationMs: 180_000,
    targetMinDurationMs: 60_000,
    targetMaxDurationMs: 180_000,
    primaryHookMaxMs: 3_000,
  },
  "book-deep-reading": {
    name: "book-deep-reading",
    hardMaxDurationMs: 360_000,
    targetMinDurationMs: 270_000,
    targetMaxDurationMs: 330_000,
    primaryHookMaxMs: 3_000,
  },
};

export const getStoryboardProfile = (
  name: StoryboardProfileName,
): StoryboardProfile => PROFILES[name];
