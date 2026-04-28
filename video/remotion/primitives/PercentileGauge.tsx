import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../config/easing";
import { MONOSPACE_FONT } from "../../config/fonts";
import type { Theme } from "../../config/themes";
import { COLORS } from "../../config/themes";
import { BENCHMARKS_PALETTE } from "../../config/benchmarks-layout";
import { BreathingHaloRing } from "./NodeHaloRing";
import { ScaleInNumber } from "./ScaleInNumber";

export type PercentileGaugeProps = {
  theme: Theme;
  x: number;
  y: number;
  /** Gauge track width. Default 1200. */
  w?: number;
  /** Track thickness. Default 28. */
  trackH?: number;
  /** Percentile rank 0..100 where 100 = top. */
  rank: number;
  /** Above this rank, paint the top-tier wash. Default 90. */
  topTierThreshold?: number;
  trackDrawStartFrame?: number;
  trackDrawDurationFrames?: number;
  markerStartFrame?: number;
  markerDurationFrames?: number;
  calloutStartFrame?: number;
  calloutFormat?: (rank: number) => string;
  baselineRank?: number;
  axisTicks?: readonly number[];
  showCallout?: boolean;
  /** When true, the callout pops in via `ScaleInNumber` (SPRING_HERO) instead
   *  of a simple fade/translate. Reserve for the Quality pillar's hero gauge. */
  heroCallout?: boolean;
  /** Marker drives via spring? Default false (use `interpolate` only —
   *  PercentileGauge never holds the slide's hero spring). Typed false-only. */
  markerSpring?: false;
};

export type PercentileGaugeFrameState = {
  /** Absolute x coordinate of marker (relative to gauge's x=0). */
  markerX: number;
  /** `(rank/100) * w` — where the marker lands. */
  markerTargetX: number;
  /** 0..1 — track fill progress across `trackDrawDurationFrames`. */
  trackFillProgress: number;
  /** True once the marker has finished its slide-in. */
  markerSettled: boolean;
  /** Interpolated 0 → rank for callout digits. */
  currentRank: number;
};

const DEFAULT_W = 1200;
const DEFAULT_TRACK_H = 28;
const DEFAULT_TRACK_DUR = 48;
const DEFAULT_MARKER_DUR = 42;
const DEFAULT_CALLOUT_FADE = 24;
const DEFAULT_TOP_TIER = 90;
const MARKER_DOT = 14;
const DEFAULT_CALLOUT_FMT = (rank: number) => `TOP ${100 - Math.round(rank)}%`;

export const computePercentileGauge = (
  frame: number,
  props: PercentileGaugeProps,
): PercentileGaugeFrameState => {
  const w = props.w ?? DEFAULT_W;
  const rank = props.rank;
  const markerTargetX = (rank / 100) * w;

  const trackStart = props.trackDrawStartFrame ?? 0;
  const trackDur = props.trackDrawDurationFrames ?? DEFAULT_TRACK_DUR;
  const trackFillProgress = interpolate(
    frame,
    [trackStart, trackStart + trackDur],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const mStart = props.markerStartFrame ?? 0;
  const mDur = props.markerDurationFrames ?? DEFAULT_MARKER_DUR;
  const markerProgress = interpolate(
    frame,
    [mStart, mStart + mDur],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const markerX = markerProgress * markerTargetX;
  const markerSettled = frame >= mStart + mDur;
  const currentRank = rank * markerProgress;

  return {
    markerX,
    markerTargetX,
    trackFillProgress,
    markerSettled,
    currentRank,
  };
};

export const PercentileGauge: React.FC<PercentileGaugeProps> = (props) => {
  const {
    theme,
    x,
    y,
    w = DEFAULT_W,
    trackH = DEFAULT_TRACK_H,
    topTierThreshold = DEFAULT_TOP_TIER,
    markerStartFrame = 0,
    markerDurationFrames = DEFAULT_MARKER_DUR,
    calloutStartFrame,
    calloutFormat = DEFAULT_CALLOUT_FMT,
    baselineRank,
    axisTicks,
    showCallout = true,
    heroCallout = false,
  } = props;

  const frame = useCurrentFrame();
  const palette = COLORS[theme];
  const { markerX, trackFillProgress, currentRank } = computePercentileGauge(
    frame,
    props,
  );

  const calloutStart = calloutStartFrame ?? markerStartFrame;
  const calloutOpacity = interpolate(
    frame,
    [calloutStart, calloutStart + DEFAULT_CALLOUT_FADE],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const calloutTranslate = interpolate(
    frame,
    [calloutStart, calloutStart + DEFAULT_CALLOUT_FADE],
    [12, 0],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const calloutText = calloutFormat(currentRank);

  const topTierLeft = (topTierThreshold / 100) * w;
  const topTierWidth = Math.max(0, w - topTierLeft);
  const baselineX =
    baselineRank !== undefined ? (baselineRank / 100) * w : null;
  const halfDot = MARKER_DOT / 2;
  const markerSettledFrame = markerStartFrame + markerDurationFrames;
  const radius = trackH / 2;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        pointerEvents: "none",
      }}
    >
      {/* Track background */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height: trackH,
          background: palette.CAPTIONS_BACKGROUND,
          borderRadius: radius,
        }}
      />
      {/* Track fill — extends only up to marker position (not entire track),
          so the gauge visually represents rank position, not 100% progress. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: Math.min(markerX, trackFillProgress * w),
          height: trackH,
          background: palette.WORD_COLOR_ON_BG_APPEARED,
          borderRadius:
            markerX >= w * 0.98 ? radius : `${radius}px 0 0 ${radius}px`,
          opacity: 0.85,
        }}
      />
      {/* Top-tier wash */}
      {topTierThreshold < 100 && topTierWidth > 0 ? (
        <div
          style={{
            position: "absolute",
            left: topTierLeft,
            top: 0,
            width: topTierWidth,
            height: trackH,
            background: BENCHMARKS_PALETTE.topTierTint,
            borderRadius: `0 ${radius}px ${radius}px 0`,
          }}
        />
      ) : null}

      {/* Axis ticks */}
      {axisTicks?.map((tick) => (
        <React.Fragment key={`tick-${tick}`}>
          <div
            style={{
              position: "absolute",
              left: (tick / 100) * w,
              top: trackH + 4,
              width: 1,
              height: 6,
              background: palette.WORD_COLOR_ON_BG_GREYED,
            }}
          />
          <div
            style={{
              ...MONOSPACE_FONT,
              position: "absolute",
              left: (tick / 100) * w - 12,
              top: trackH + 12,
              width: 24,
              fontSize: 11,
              color: palette.WORD_COLOR_ON_BG_GREYED,
              textAlign: "center",
            }}
          >
            {tick}
          </div>
        </React.Fragment>
      ))}

      {/* Baseline marker (triangle pointing up) */}
      {baselineX !== null ? (
        <div
          style={{
            position: "absolute",
            left: baselineX - 5,
            top: -10,
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderBottom: `10px solid ${palette.WORD_COLOR_ON_BG_GREYED}`,
          }}
        />
      ) : null}

      {/* Marker vertical line */}
      <div
        style={{
          position: "absolute",
          left: markerX - 1,
          top: -8,
          width: 2,
          height: trackH + 16,
          background: BENCHMARKS_PALETTE.trapCaughtGreen,
        }}
      />
      {/* Marker dot */}
      <div
        style={{
          position: "absolute",
          left: markerX - halfDot,
          top: trackH / 2 - halfDot,
          width: MARKER_DOT,
          height: MARKER_DOT,
          borderRadius: 999,
          background: BENCHMARKS_PALETTE.trapCaughtGreen,
        }}
      />
      {/* Sustained halo ring around the dot, starting once marker settles */}
      <div
        style={{
          position: "absolute",
          left: markerX - halfDot,
          top: trackH / 2 - halfDot,
        }}
      >
        <BreathingHaloRing
          x={0}
          y={0}
          w={MARKER_DOT}
          h={MARKER_DOT}
          radius={halfDot}
          at={markerSettledFrame}
          color={BENCHMARKS_PALETTE.trapCaughtGreen}
          periodFrames={120}
        />
      </div>

      {/* Callout above marker. `heroCallout` swaps the fade/translate entrance
          for SPRING_HERO via ScaleInNumber for high-emphasis slides. */}
      {showCallout ? (
        heroCallout ? (
          <div
            style={{
              ...MONOSPACE_FONT,
              position: "absolute",
              left: markerX - 80,
              top: -90,
              width: 160,
              fontSize: 40,
              fontWeight: 700,
              color: BENCHMARKS_PALETTE.trapCaughtGreen,
              textAlign: "center",
              letterSpacing: "0.02em",
              lineHeight: 1,
            }}
          >
            <ScaleInNumber value={calloutText} delay={calloutStart} />
          </div>
        ) : (
          <div
            style={{
              ...MONOSPACE_FONT,
              position: "absolute",
              left: markerX - 80,
              top: -90,
              width: 160,
              fontSize: 40,
              fontWeight: 700,
              color: BENCHMARKS_PALETTE.trapCaughtGreen,
              textAlign: "center",
              opacity: calloutOpacity,
              transform: `translateY(${calloutTranslate}px)`,
              letterSpacing: "0.02em",
              lineHeight: 1,
            }}
          >
            {calloutText}
          </div>
        )
      ) : null}
    </div>
  );
};
