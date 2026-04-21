import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN_OUT, EASE_OUT } from "../../config/easing";

/**
 * Thin vertical hairline connecting two stacked diagram layers (e.g.
 * EXPERIENCE → ORCHESTRATION on the TechStackSlide). Three deterministic
 * phases composed on a single SVG:
 *
 *   1. Draw-in (top → bottom) via strokeDashoffset — same technique as
 *      `MotionLine`, but always vertical.
 *   2. One-shot traveling dot pulse — a small `<circle>` slides along the
 *      hairline, fading in/out at the edges of the window. Suggests data /
 *      control flowing into the next layer during initial assembly.
 *   3. Continuous shimmer — stroke opacity on a cosine loop (0.4 → 1 → 0.4).
 *      Keeps the slide alive during the sustain hold without distracting
 *      motion.
 *
 * Fully seekable: every visual state is a pure function of the frame. No
 * state, no refs, no measuring.
 */
export type DiagramConnectorProps = {
  /** Vertical pixel height of the hairline. */
  height: number;
  /** Absolute frame at which the hairline starts drawing (top→bottom). Default 0. */
  drawStartFrame?: number;
  /** Draw duration in frames. Default 20. */
  drawDurationFrames?: number;
  /** Hairline color. Default `#E5E5E5` (BORDER_COLOR in light theme). */
  strokeColor?: string;
  /** Hairline stroke width. Default 1.5. */
  strokeWidth?: number;
  /**
   * Absolute frame at which the single traveling-dot pulse begins. Omit to
   * skip the assembly pulse.
   */
  pulseStartFrame?: number;
  /** Pulse travel duration in frames. Default 30. */
  pulseDurationFrames?: number;
  /** Pulse dot color. Default matches `strokeColor`. */
  pulseColor?: string;
  /** Pulse dot radius in pixels. Default 3. */
  pulseRadius?: number;
  /**
   * Absolute frame at which continuous shimmer begins. Omit to keep the
   * stroke at full opacity after the draw-in.
   */
  shimmerStartFrame?: number;
  /** Shimmer full period in frames. Default 120 (2s @ 60fps). */
  shimmerPeriodFrames?: number;
  /** SVG width (horizontal slack). Default 8. Hairline + dot sit at svgWidth/2. */
  svgWidth?: number;
  /** Passthrough for absolute positioning inside a slide. */
  style?: React.CSSProperties;
};

const DEFAULT_STROKE_COLOR = "#E5E5E5";
const DEFAULT_STROKE_WIDTH = 1.5;
const DEFAULT_DRAW_DURATION_FRAMES = 20;
const DEFAULT_PULSE_DURATION_FRAMES = 30;
const DEFAULT_PULSE_RADIUS = 3;
const DEFAULT_SHIMMER_PERIOD_FRAMES = 120;
const DEFAULT_SVG_WIDTH = 8;
const PULSE_FADE_FRAMES = 6;
const SHIMMER_MIN = 0.4;
const SHIMMER_MAX = 1.0;

export type DiagramConnectorState = {
  /** Dashoffset for the hairline. Full length = not drawn, 0 = fully drawn. */
  dashoffset: number;
  /** Full dasharray length (= hairline `height`). */
  length: number;
  /** Hairline stroke opacity (shimmer-modulated). */
  strokeOpacity: number;
  /** Pulse dot state, or null if pulse is inactive / not configured. */
  pulse: { cy: number; opacity: number } | null;
};

/**
 * Pure keyframe calculator. Exported for unit tests so the timing math can
 * be verified without rendering or mocking Remotion's frame context.
 */
export const computeDiagramConnector = (
  frame: number,
  props: DiagramConnectorProps,
): DiagramConnectorState => {
  const {
    height,
    drawStartFrame = 0,
    drawDurationFrames = DEFAULT_DRAW_DURATION_FRAMES,
    pulseStartFrame,
    pulseDurationFrames = DEFAULT_PULSE_DURATION_FRAMES,
    shimmerStartFrame,
    shimmerPeriodFrames = DEFAULT_SHIMMER_PERIOD_FRAMES,
  } = props;

  // Draw-in: dashoffset goes length → 0 across [drawStartFrame, drawStartFrame + drawDurationFrames].
  const drawProgress = interpolate(
    frame,
    [drawStartFrame, drawStartFrame + drawDurationFrames],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const dashoffset = (1 - drawProgress) * height;

  // Shimmer: only active from shimmerStartFrame onward. Cosine gives a smooth
  // 0.4 → 1 → 0.4 loop; trough sits at t = period/2, peak at t = 0 and period.
  let strokeOpacity = 1;
  if (shimmerStartFrame !== undefined && frame >= shimmerStartFrame) {
    const t = (frame - shimmerStartFrame) % shimmerPeriodFrames;
    const phase = (t / shimmerPeriodFrames) * Math.PI * 2;
    // cos(0) = 1 → SHIMMER_MAX; cos(PI) = -1 → SHIMMER_MIN.
    const norm = (Math.cos(phase) + 1) / 2;
    strokeOpacity = SHIMMER_MIN + (SHIMMER_MAX - SHIMMER_MIN) * norm;
  }

  // Pulse: single traveling dot, only rendered inside its window.
  let pulse: DiagramConnectorState["pulse"] = null;
  if (pulseStartFrame !== undefined) {
    const pulseEnd = pulseStartFrame + pulseDurationFrames;
    if (frame >= pulseStartFrame && frame <= pulseEnd) {
      const cy = interpolate(
        frame,
        [pulseStartFrame, pulseEnd],
        [0, height],
        {
          easing: EASE_IN_OUT,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      );
      // Fade in across the first PULSE_FADE_FRAMES, hold, fade out across the last.
      const fadeIn = interpolate(
        frame,
        [pulseStartFrame, pulseStartFrame + PULSE_FADE_FRAMES],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      const fadeOut = interpolate(
        frame,
        [pulseEnd - PULSE_FADE_FRAMES, pulseEnd],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      pulse = { cy, opacity: Math.min(fadeIn, fadeOut) };
    }
  }

  return { dashoffset, length: height, strokeOpacity, pulse };
};

export const DiagramConnector: React.FC<DiagramConnectorProps> = (props) => {
  const frame = useCurrentFrame();
  const {
    height,
    strokeColor = DEFAULT_STROKE_COLOR,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    pulseColor,
    pulseRadius = DEFAULT_PULSE_RADIUS,
    svgWidth = DEFAULT_SVG_WIDTH,
    style,
  } = props;

  const { dashoffset, length, strokeOpacity, pulse } = computeDiagramConnector(
    frame,
    props,
  );

  const cx = svgWidth / 2;
  const dotFill = pulseColor ?? strokeColor;

  return (
    <svg
      width={svgWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      style={{ overflow: "visible", ...style }}
    >
      <line
        x1={cx}
        y1={0}
        x2={cx}
        y2={height}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={dashoffset}
        opacity={strokeOpacity}
      />
      {pulse !== null ? (
        <circle
          cx={cx}
          cy={pulse.cy}
          r={pulseRadius}
          fill={dotFill}
          opacity={pulse.opacity}
        />
      ) : null}
    </svg>
  );
};
