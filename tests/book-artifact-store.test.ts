import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {z} from "zod";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";
import {
  readValidatedJson,
  writeValidatedJson,
} from "../src/research/book/artifact-store";
import {createArtifactFingerprint} from "../src/research/book/fingerprint";

const ArtifactSchema = z.object({
  title: z.string().min(1),
  revision: z.number().int().positive(),
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, {force: true, recursive: true}),
  ));
});

describe("book artifact storage", () => {
  it("creates a SHA-256 fingerprint that changes when the prompt version changes", () => {
    const baseline = createArtifactFingerprint({
      inputHash: "a".repeat(64),
      modelProfile: "balanced",
      promptVersion: "book-source-v1",
      schemaVersion: "1.0.0",
    });
    const changedPrompt = createArtifactFingerprint({
      inputHash: "a".repeat(64),
      modelProfile: "balanced",
      promptVersion: "book-source-v2",
      schemaVersion: "1.0.0",
    });

    expect(baseline).toMatch(/^[a-f0-9]{64}$/);
    expect(changedPrompt).not.toBe(baseline);
  });

  it("uses the canonical book artifact directory", () => {
    const paths = getBookArtifactPaths("book-demo");

    expect(paths.directory).toBe(resolve("output/book-demo/book"));
    expect(paths.source).toBe(resolve("output/book-demo/book/book-source.json"));
    expect(paths.map).toBe(resolve("output/book-demo/book/book-map.json"));
    expect(paths.visualsDirectory).toBe(resolve("output/book-demo/book/visuals"));
    expect(paths.chapter("chapter-001")).toBe(
      resolve("output/book-demo/book/chapters/chapter-001.json"),
    );
  });

  it.each(["../book-demo", "book/demo", "/tmp/book-demo"])(
    "rejects an unsafe job id: %s",
    (jobId) => {
      expect(() => getBookArtifactPaths(jobId)).toThrow();
    },
  );

  it("writes and reads a schema-validated artifact using the real filesystem", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-artifact-store-"));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, "artifact.json");
    const artifact = {title: "深读", revision: 1};

    await writeValidatedJson(artifactPath, ArtifactSchema, artifact);

    await expect(readValidatedJson(artifactPath, ArtifactSchema)).resolves.toEqual(artifact);
  });

  it("rejects an invalid replacement without overwriting the valid artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "book-artifact-store-"));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, "artifact.json");
    const originalArtifact = {title: "已验证版本", revision: 1};

    await writeValidatedJson(artifactPath, ArtifactSchema, originalArtifact);

    await expect(writeValidatedJson(artifactPath, ArtifactSchema, {
      title: "无效替换",
      revision: 0,
    })).rejects.toThrow();

    await expect(readValidatedJson(artifactPath, ArtifactSchema)).resolves.toEqual(originalArtifact);
  });
});
