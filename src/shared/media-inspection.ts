import {ALL_FORMATS, FilePathSource, Input} from "mediabunny";

export type MediaInspection = {
  canRead: boolean;
  durationMs: number;
  mimeType: string | null;
  audioTracks: Array<{
    codec: string | null;
    durationMs: number;
    channels: number;
    sampleRate: number;
  }>;
  videoTracks: Array<{
    codec: string | null;
    durationMs: number;
    width: number;
    height: number;
    fps: number;
  }>;
};

export const inspectMediaFile = async (
  filePath: string,
): Promise<MediaInspection> => {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new FilePathSource(filePath),
  });
  try {
    const canRead = await input.canRead();
    if (!canRead) {
      return {
        canRead: false,
        durationMs: 0,
        mimeType: null,
        audioTracks: [],
        videoTracks: [],
      };
    }
    const [durationSeconds, mimeType, audioTracks, videoTracks] =
      await Promise.all([
        input.computeDuration(),
        input.getMimeType(),
        input.getAudioTracks(),
        input.getVideoTracks(),
      ]);
    return {
      canRead: true,
      durationMs: Math.round(durationSeconds * 1000),
      mimeType,
      audioTracks: await Promise.all(
        audioTracks.map(async (track) => ({
          codec: await track.getCodec(),
          durationMs: Math.round((await track.computeDuration()) * 1000),
          channels: await track.getNumberOfChannels(),
          sampleRate: await track.getSampleRate(),
        })),
      ),
      videoTracks: await Promise.all(
        videoTracks.map(async (track) => ({
          codec: await track.getCodec(),
          durationMs: Math.round((await track.computeDuration()) * 1000),
          width: await track.getDisplayWidth(),
          height: await track.getDisplayHeight(),
          fps: (await track.computePacketStats(120)).averagePacketRate,
        })),
      ),
    };
  } finally {
    input.dispose();
  }
};
