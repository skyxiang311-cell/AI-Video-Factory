import {createTikTokStyleCaptions, type TikTokPage} from "@remotion/captions";
import {useMemo} from "react";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {
  StoryboardCaption,
  StoryboardScene,
} from "../../../storyboard/schema";
import {millisecondsToFrames} from "../../../storyboard/timeline";
import {knowledgeTheme} from "../theme";

const SWITCH_CAPTIONS_EVERY_MS = 1100;

type CaptionPageProps = {
  accentColor: string;
  page: TikTokPage;
};

const CaptionPage = ({accentColor, page}: CaptionPageProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const absoluteTimeMs = page.startMs + (frame / fps) * 1000;
  const entrance = interpolate(frame, [0, Math.round(fps * 0.18)], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 250,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(4, 6, 10, 0.82)",
          border: "2px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 28,
          boxShadow: knowledgeTheme.shadow,
          color: knowledgeTheme.text,
          fontFamily: knowledgeTheme.fontFamily,
          fontSize: knowledgeTheme.captionSize,
          fontWeight: 800,
          lineHeight: 1.35,
          maxWidth: 900,
          opacity: entrance,
          padding: "22px 34px 28px",
          transform: `translateY(${(1 - entrance) * 28}px) scale(${0.96 + entrance * 0.04})`,
          textAlign: "center",
          whiteSpace: "pre-wrap",
        }}
      >
        {page.tokens.map((token) => {
          const isActive =
            token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;

          return (
            <span
              key={`${token.fromMs}-${token.toMs}-${token.text}`}
              style={{color: isActive ? accentColor : knowledgeTheme.text}}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

type DynamicCaptionsProps = {
  captions: StoryboardCaption[];
  scenes: StoryboardScene[];
};

export const DynamicCaptions = ({captions, scenes}: DynamicCaptionsProps) => {
  const {fps} = useVideoConfig();
  const pages = useMemo(
    () =>
      captions.flatMap(
        (caption) =>
          createTikTokStyleCaptions({
            captions: [caption],
            combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
          }).pages,
      ),
    [captions],
  );

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const startFrame = millisecondsToFrames(page.startMs, fps);
        const endMs = page.startMs + page.durationMs;
        const endFrame = millisecondsToFrames(endMs, fps);
        const durationInFrames = endFrame - startFrame;
        const activeScene =
          scenes.find(
            (scene) => page.startMs >= scene.startMs && page.startMs < scene.endMs,
          ) ?? scenes[0];

        if (durationInFrames <= 0 || !activeScene) {
          return null;
        }

        return (
          <Sequence
            key={`${page.startMs}-${index}`}
            from={startFrame}
            durationInFrames={durationInFrames}
            layout="none"
          >
            <CaptionPage
              accentColor={activeScene.presentation.accentColor}
              page={page}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
