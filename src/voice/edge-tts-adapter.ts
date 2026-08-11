import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {readFile, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {inspectMediaFile} from "../shared/media-inspection";
import type {VoiceBoundary} from "../subtitles/voice-caption-alignment";

export type EdgeVoiceSettings = {
  voice: string;
  rate: string;
  pitch: string;
  volume: string;
};

export type TtsSegmentRequest = {
  sceneId: string;
  text: string;
  audioPath: string;
};

export type TtsSegmentResult = {
  sceneId: string;
  text: string;
  audioPath: string;
  durationMs: number;
  boundaries: VoiceBoundary[];
};

type RawMetadata = {
  boundaries: Array<{
    text: string;
    offsetTicks: number;
    durationTicks: number;
  }>;
};

export const ticksToMilliseconds = (ticks: number): number =>
  Math.round(ticks / 10_000);

export const buildVoiceFingerprint = (input: EdgeVoiceSettings & {texts: string[]}): string =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");

const runBridge = (
  pythonPath: string,
  bridgePath: string,
  request: Record<string, unknown>,
): Promise<void> =>
  new Promise((resolveProcess, reject) => {
    const child = spawn(pythonPath, [bridgePath], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveProcess();
      } else {
        reject(new Error(`Edge TTS bridge failed: code=${String(code)} signal=${String(signal)}`));
      }
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });

export class EdgeTtsAdapter {
  readonly provider = "edge-tts";

  constructor(
    private readonly pythonPath: string,
    private readonly settings: EdgeVoiceSettings,
    private readonly bridgePath = resolve("scripts/edge-tts-bridge.py"),
  ) {}

  async synthesize(request: TtsSegmentRequest): Promise<TtsSegmentResult> {
    const metadataPath = `${request.audioPath}.metadata.json`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await runBridge(this.pythonPath, this.bridgePath, {
          text: request.text,
          audioPath: request.audioPath,
          metadataPath,
          ...this.settings,
        });
        const [fileStats, media, metadataText] = await Promise.all([
          stat(request.audioPath),
          inspectMediaFile(request.audioPath),
          readFile(metadataPath, "utf8"),
        ]);
        if (fileStats.size < 1024 || media.audioTracks.length !== 1 || media.durationMs <= 0) {
          throw new Error(`Edge TTS returned invalid audio for ${request.sceneId}`);
        }
        const metadata = JSON.parse(metadataText) as RawMetadata;
        return {
          ...request,
          durationMs: media.durationMs,
          boundaries: metadata.boundaries.map((boundary) => ({
            text: boundary.text,
            offsetMs: ticksToMilliseconds(boundary.offsetTicks),
            durationMs: ticksToMilliseconds(boundary.durationTicks),
          })),
        };
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolveWait) => setTimeout(resolveWait, attempt * 750));
        }
      }
    }
    throw lastError;
  }
}
