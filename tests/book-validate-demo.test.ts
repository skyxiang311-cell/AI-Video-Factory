import {cp, mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import * as bookDemo from "../scripts/book-validate-demo";
import {getBookArtifactPaths} from "../src/research/book/artifact-paths";

const {validateBookContractDemo} = bookDemo;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, {force: true, recursive: true}),
  ));
});

describe("book contract validation demo", () => {
  it("validates the locked Book Deep Reading fixtures for video", async () => {
    const result = await validateBookContractDemo();

    expect(result.deepReadingStatus).toBe("approved_for_video");
    expect(result.traceabilityIssues).toEqual([]);
    expect(result.selectedAngle.targetDurationSec).toBe(300);
    expect(result.storyboardProfile.name).toBe("book-deep-reading");
  });

  it("writes a resolvable canonical artifact index", async () => {
    await validateBookContractDemo();
    const paths = getBookArtifactPaths("book-contract-demo");
    const analysis = JSON.parse(await readFile(paths.analysis, "utf8")) as {
      artifacts: {
        source: string;
        chapters: string[];
        synthesis: string;
        verification: string;
        angles: string;
        selectedAngle: string;
      };
    };

    expect(analysis.artifacts).toEqual({
      source: paths.source,
      chapters: [paths.chapter("chapter-feedback-window")],
      synthesis: paths.synthesis,
      verification: paths.verification,
      angles: paths.angles,
      selectedAngle: paths.selectedAngle,
    });
    await expect(Promise.all([
      analysis.artifacts.source,
      ...analysis.artifacts.chapters,
      analysis.artifacts.synthesis,
      analysis.artifacts.verification,
      analysis.artifacts.angles,
      analysis.artifacts.selectedAngle,
    ].map((artifactPath) => stat(artifactPath)))).resolves.toHaveLength(6);
  });

  it("returns a nonzero CLI result when artifact-graph validation blocks", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "book-demo-invalid-"));
    temporaryDirectories.push(fixtureDirectory);
    await cp(resolve("templates/book-deep-reading"), fixtureDirectory, {recursive: true});
    const synthesisPath = join(fixtureDirectory, "sample-book-synthesis.json");
    const synthesis = JSON.parse(await readFile(synthesisPath, "utf8")) as {
      claimRelations: {fromClaimId: string}[];
    };
    synthesis.claimRelations[0]!.fromClaimId = "claim-missing-cli";
    await writeFile(synthesisPath, `${JSON.stringify(synthesis, null, 2)}\n`);
    const errors: string[] = [];
    const runCli = Reflect.get(bookDemo, "runBookContractDemoCli") as
      | ((options: {
        fixtureDirectory: string;
        stdout: (message: string) => void;
        stderr: (message: string) => void;
      }) => Promise<number>)
      | undefined;

    expect(runCli).toBeTypeOf("function");
    await expect(runCli!({
      fixtureDirectory,
      stdout: () => undefined,
      stderr: (message) => errors.push(message),
    })).resolves.toBe(1);
    expect(errors.join("\n")).toContain("MISSING_SYNTHESIS_CLAIM");
  });
});
