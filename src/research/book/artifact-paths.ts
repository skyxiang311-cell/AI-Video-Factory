import {isAbsolute, resolve} from "node:path";

const assertSafePathSegment = (value: string, label: string): void => {
  if (!value || value.includes("..") || value.includes("/") || value.includes("\\") || isAbsolute(value)) {
    throw new Error(`Unsafe ${label}: ${value}`);
  }
};

export interface BookArtifactPaths {
  directory: string;
  source: string;
  chaptersDirectory: string;
  synthesis: string;
  verification: string;
  angles: string;
  selectedAngle: string;
  analysis: string;
  chapter: (chapterId: string) => string;
}

export const getBookArtifactPaths = (jobId: string): BookArtifactPaths => {
  assertSafePathSegment(jobId, "job id");

  const directory = resolve("output", jobId, "book");
  const chaptersDirectory = resolve(directory, "chapters");

  return {
    directory,
    source: resolve(directory, "book-source.json"),
    chaptersDirectory,
    synthesis: resolve(directory, "book-synthesis.json"),
    verification: resolve(directory, "verification.json"),
    angles: resolve(directory, "video-angles.json"),
    selectedAngle: resolve(directory, "selected-angle.json"),
    analysis: resolve(directory, "book-analysis.json"),
    chapter: (chapterId: string): string => {
      assertSafePathSegment(chapterId, "chapter id");
      return resolve(chaptersDirectory, `${chapterId}.json`);
    },
  };
};
