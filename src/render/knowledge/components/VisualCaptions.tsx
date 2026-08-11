import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig} from "remotion";
import {
  layoutChineseCaption,
  tokenizeCaptionLine,
} from "../../../storyboard/caption-layout";
import type {
  VisualCaption,
  VisualScene,
} from "../../../storyboard/visual-schema";
import {millisecondsToFrames} from "../../../storyboard/timeline";
import {getCaptionMotion, resolveCaptionTokenStyle} from "../caption-motion";
import {knowledgeTheme} from "../theme";
import {resolveAccent, resolveCanvasColors} from "../visual-utils";

type CaptionCardProps = {
  accentColor: string;
  caption: VisualCaption;
  durationInFrames: number;
};

const CaptionCard = ({accentColor, caption, durationInFrames}: CaptionCardProps) => {
  const frame = useCurrentFrame();
  const motion = getCaptionMotion(frame, durationInFrames);
  const lines = layoutChineseCaption(caption.text);

  return (
    <AbsoluteFill style={{alignItems: "center", justifyContent: "flex-end", paddingBottom: 300, pointerEvents: "none"}}>
      <div
        style={{
          backgroundColor: "rgba(13, 15, 19, 0.92)",
          border: "1px solid rgba(255, 255, 255, 0.13)",
          boxShadow: "0 18px 48px rgba(0, 0, 0, 0.28)",
          color: "#f3f0e8",
          fontFamily: knowledgeTheme.fontFamily,
          fontSize: knowledgeTheme.captionSize,
          lineHeight: 1.3,
          maxWidth: 820,
          opacity: motion.opacity,
          padding: "18px 30px 22px",
          textAlign: "center",
          translate: `0px ${motion.translateY}px`,
        }}
      >
        {lines.map((line) => (
          <div key={line} style={{whiteSpace: "nowrap"}}>
            {tokenizeCaptionLine(line, caption.emphasis).map((token, index) => {
              const tokenStyle = resolveCaptionTokenStyle(token.style);
              return (
                <span
                  key={`${token.text}-${index}`}
                  style={{
                    color: tokenStyle.colorRole === "accent" ? accentColor : "#f3f0e8",
                    fontSize: `${tokenStyle.fontScale}em`,
                    fontWeight: tokenStyle.fontWeight,
                  }}
                >
                  {token.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

type VisualCaptionsProps = {
  captions: VisualCaption[];
  scenes: VisualScene[];
};

export const VisualCaptions = ({captions, scenes}: VisualCaptionsProps) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill>
      {captions.map((caption, index) => {
        const startFrame = millisecondsToFrames(caption.startMs, fps);
        const endFrame = millisecondsToFrames(caption.endMs, fps);
        const durationInFrames = endFrame - startFrame;
        const scene = scenes.find(
          (candidate) => caption.startMs >= candidate.startMs && caption.startMs < candidate.endMs,
        );
        if (!scene || durationInFrames <= 0) {
          return null;
        }
        const accentColor = resolveAccent(scene.visualData.accent);
        resolveCanvasColors(scene.visualData.tone);
        return (
          <Sequence key={`${caption.startMs}-${index}`} from={startFrame} durationInFrames={durationInFrames} layout="none">
            <CaptionCard accentColor={accentColor} caption={caption} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
