import {mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import type {NarrationPlan} from "../narration/build-narration-plan";
import {analyzeBoundaryGaps} from "../narration/pause-analysis";
import {inspectMediaFile} from "../shared/media-inspection";
import {assignBoundariesToParts} from "./voice-segment-processing";
import type {VoiceProvider} from "./voice-provider";
import {trimVoiceSegment, type TrimmedVoiceSegment} from "./trim-voice-segment";

export type SynthesizedNarrationBlock = {
  id: string;
  text: string;
  pauseAfter: string;
  pauseAfterMs: number;
  raw: {audioPath: string; durationMs: number};
  trimmed: TrimmedVoiceSegment;
  parts: ReturnType<typeof assignBoundariesToParts>;
  pauseAnalysis: ReturnType<typeof analyzeBoundaryGaps>;
};

export const synthesizeNarrationBlocks = async (input: {
  provider: VoiceProvider;
  plan: NarrationPlan;
  segmentDirectory: string;
}): Promise<SynthesizedNarrationBlock[]> => {
  const rawDirectory = resolve(input.segmentDirectory, "raw");
  const trimmedDirectory = resolve(input.segmentDirectory, "trimmed");
  await Promise.all([
    mkdir(rawDirectory, {recursive: true}),
    mkdir(trimmedDirectory, {recursive: true}),
  ]);
  const results: SynthesizedNarrationBlock[] = [];
  for (const [index, block] of input.plan.blocks.entries()) {
    console.log(`生成语义配音 ${index + 1}/${input.plan.blocks.length}：${block.id}`);
    const raw = await input.provider.synthesize({
      segmentId: block.id,
      text: block.text,
      audioPath: resolve(rawDirectory, `${block.id}.mp3`),
    });
    const trimmed = await trimVoiceSegment(
      raw,
      resolve(trimmedDirectory, `${block.id}.mp3`),
    );
    const media = await inspectMediaFile(trimmed.audioPath);
    if (media.durationMs !== trimmed.durationMs) {
      throw new Error(`语义配音时长读取不一致：${block.id}`);
    }
    results.push({
      id: block.id,
      text: block.text,
      pauseAfter: block.pauseAfter,
      pauseAfterMs: block.pauseAfterMs,
      raw: {audioPath: raw.audioPath, durationMs: raw.durationMs},
      trimmed,
      parts: assignBoundariesToParts(block.parts, trimmed.boundaries),
      pauseAnalysis: analyzeBoundaryGaps(trimmed.boundaries),
    });
  }
  return results;
};
