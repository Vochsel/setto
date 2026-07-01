import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  type CalculateMetadataFunction,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
  type TransitionPresentation,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import {
  getTemplate,
  msToFrames,
  specDurationFrames,
  type VideoClip,
  type VideoSpec,
  type TransitionType,
} from "./video";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Derive composition size / fps / duration from the spec passed as inputProps.
 * Remotion calls this both in the Studio/Player and on Lambda, so the same spec
 * yields identical output everywhere.
 */
export const calculateTimelineMetadata: CalculateMetadataFunction<
  VideoSpec
> = ({ props }) => {
  return {
    durationInFrames: specDurationFrames(props),
    fps: props.fps,
    width: props.width,
    height: props.height,
  };
};

// ── Clip renderers ──────────────────────────────────────────────────────────

/** An image still with an optional Ken Burns pan/zoom over `clipFrames`. */
const ImageClip: React.FC<{ clip: VideoClip; clipFrames: number }> = ({
  clip,
  clipFrames,
}) => {
  const frame = useCurrentFrame();
  const e = clip.effect;
  const t = clipFrames <= 1 ? 1 : Math.min(1, Math.max(0, frame / (clipFrames - 1)));

  let transform = "scale(1)";
  if (e && e.type === "kenburns") {
    const scale = lerp(e.fromScale ?? 1, e.toScale ?? 1, t);
    // Normalized pan [-1,1] mapped to a gentle percentage translate.
    const x = lerp(e.fromX ?? 0, e.toX ?? 0, t) * 8;
    const y = lerp(e.fromY ?? 0, e.toY ?? 0, t) * 8;
    transform = `scale(${scale}) translate(${x}%, ${y}%)`;
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={clip.url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform,
        }}
      />
      {clip.caption ? <Caption text={clip.caption} /> : null}
    </AbsoluteFill>
  );
};

/** A motion clip (i2v render) played as part of the timeline. */
const MotionClip: React.FC<{ clip: VideoClip }> = ({ clip }) => {
  const startFrom = clip.trimStartMs
    ? msToFrames(clip.trimStartMs, 30)
    : undefined;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <OffthreadVideo
        src={clip.url}
        startFrom={startFrom}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {clip.caption ? <Caption text={clip.caption} /> : null}
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill
    style={{
      justifyContent: "flex-end",
      alignItems: "center",
      padding: "6%",
    }}
  >
    <div
      style={{
        color: "white",
        fontSize: 52,
        fontWeight: 700,
        fontFamily: "system-ui, sans-serif",
        textShadow: "0 2px 18px rgba(0,0,0,0.6)",
        textAlign: "center",
        lineHeight: 1.1,
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);

const Clip: React.FC<{ clip: VideoClip; clipFrames: number }> = ({
  clip,
  clipFrames,
}) =>
  clip.sourceType === "video" ? (
    <MotionClip clip={clip} />
  ) : (
    <ImageClip clip={clip} clipFrames={clipFrames} />
  );

// ── Transition presentation mapping ──────────────────────────────────────────

// All presentations are normalized to a common type so they can share one
// <TransitionSeries.Transition> call site.
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

function presentationFor(type: TransitionType): AnyPresentation {
  switch (type) {
    case "slide":
      return slide() as unknown as AnyPresentation;
    case "wipe":
      return wipe() as unknown as AnyPresentation;
    case "fade":
    case "dissolve":
    default:
      return fade() as unknown as AnyPresentation;
  }
}

// ── Sequence (slideshow / Ken Burns / reel) rendering ────────────────────────

const SequenceTimeline: React.FC<{ spec: VideoSpec }> = ({ spec }) => {
  const fps = spec.fps;
  const frames = spec.clips.map((c) => Math.max(1, msToFrames(c.durationMs, fps)));

  return (
    <TransitionSeries>
      {spec.clips.map((clip, i) => {
        const clipFrames = frames[i];
        const els: React.ReactNode[] = [];

        // Incoming transition (overlap with the previous clip).
        if (i > 0) {
          const tr = clip.transition;
          const wanted = tr && tr.type !== "none" ? tr.durationMs : 0;
          // A transition must be shorter than both adjacent sequences.
          const maxOverlap = Math.max(
            0,
            Math.min(frames[i - 1], clipFrames) - 1,
          );
          const trFrames = Math.min(msToFrames(wanted, fps), maxOverlap);
          if (wanted > 0 && trFrames > 0) {
            els.push(
              <TransitionSeries.Transition
                key={`t-${clip.id}`}
                presentation={presentationFor(tr!.type)}
                timing={linearTiming({ durationInFrames: trFrames })}
              />,
            );
          }
        }

        els.push(
          <TransitionSeries.Sequence key={clip.id} durationInFrames={clipFrames}>
            <Clip clip={clip} clipFrames={clipFrames} />
          </TransitionSeries.Sequence>,
        );
        return els;
      })}
    </TransitionSeries>
  );
};

// ── Stack (layered photo pile) rendering ─────────────────────────────────────

const StackLayer: React.FC<{ clip: VideoClip; index: number }> = ({
  clip,
  index,
}) => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, 12], [0.82, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Alternate a small rotation/offset so the pile looks hand-stacked.
  const rot = (index % 2 === 0 ? 1 : -1) * (2 + (index % 3));
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          width: "72%",
          aspectRatio: "3 / 4",
          background: "white",
          padding: 14,
          paddingBottom: 48,
          borderRadius: 4,
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
          opacity: appear,
          transform: `rotate(${rot}deg) scale(${scale})`,
        }}
      >
        <Img
          src={clip.url}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    </AbsoluteFill>
  );
};

const StackTimeline: React.FC<{ spec: VideoSpec }> = ({ spec }) => {
  const template = getTemplate(spec.templateId);
  const staggerFrames = Math.max(
    1,
    msToFrames(template.stackStaggerMs ?? 600, spec.fps),
  );
  return (
    <>
      {spec.clips.map((clip, i) => (
        <Sequence key={clip.id} from={i * staggerFrames}>
          <StackLayer clip={clip} index={i} />
        </Sequence>
      ))}
    </>
  );
};

// ── Root composition ─────────────────────────────────────────────────────────

export const Timeline: React.FC<VideoSpec> = (spec) => {
  const template = getTemplate(spec.templateId);
  return (
    <AbsoluteFill style={{ backgroundColor: spec.background ?? "#000000" }}>
      {template.kind === "stack" ? (
        <StackTimeline spec={spec} />
      ) : (
        <SequenceTimeline spec={spec} />
      )}
      {spec.audio ? (
        <Audio
          src={spec.audio.url}
          volume={spec.audio.volume ?? 1}
          startFrom={
            spec.audio.startMs ? msToFrames(spec.audio.startMs, spec.fps) : 0
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};
