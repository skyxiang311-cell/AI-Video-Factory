import {createHash} from "node:crypto";

export interface ArtifactFingerprintInput {
  inputHash: string;
  promptVersion: string;
  modelProfile: string;
  schemaVersion: string;
}

export const createArtifactFingerprint = (input: ArtifactFingerprintInput): string =>
  createHash("sha256")
    .update(JSON.stringify({
      inputHash: input.inputHash,
      promptVersion: input.promptVersion,
      modelProfile: input.modelProfile,
      schemaVersion: input.schemaVersion,
    }))
    .digest("hex");
