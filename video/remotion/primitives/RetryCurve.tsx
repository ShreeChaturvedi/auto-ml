import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN_OUT, EASE_OUT } from "../../config/easing";
import { ARCH_PALETTE } from "../../config/arch-layout";

export type Point2D = { x: number; y: number };

export type RetryCurveProps = {
  /** Start point (typically the execute_training node edge). */
  from: Point2D;
  /** Control point that creates the swing-around arc. */
  control: Point2D;
  /** End point (typically install_package pill). */
  to: Point2D;
  /** Frame the curve begins drawing. Default 0. */
  drawStartFrame?: number;
  /** Draw duration. Default 48. */
  drawDurationFrames?: number;
  /** Bead frame window — optional. */
  beadStartFrame?: number;
  beadDurationFrames?: number;
  /** Stroke color. Default amber. */
  color?: string;
  /** Stroke width. Default 2.5. */
  strokeWidth?: number;
  /** Bead radius. Default 5. */
  beadRadius?: number;
  /** Bead color. Falls back to `color`. */
  beadColor?: string;
};

export type RetryCurveState = {
  dashoffset: number;
  length: number;
  bead: { cx: number; cy: number; opacity: number } | null;
};

/**
 * Sample a quadratic Bezier at parameter `t` ∈ [0, 1].
 * Exposed as a named export so scenes can place annotations at arbitrary
 * points along the curve without re-deriving the math.
 *
 * B(t) = (1-t)² · P0 + 2·(1-t)·t · P1 + t² · P2
 */
export const sampleQuadratic = (
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  t: number,
): Point2D => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
    y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y,
  };
};

/**
 * Approximate the arc length of the quadratic Bezier by sampling. Good enough
 * for `strokeDasharray` draw-in math — a few-pixel error is invisible on a
 * 2px-wide stroke.
 */
export const quadraticLength = (
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  samples = 24,
): number => {
  let total = 0;
  let prev = p0;
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const cur = sampleQuadratic(p0, p1, p2, t);
    total += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }
  return total;
};

const DEFAULT_DRAW_DURATION = 48;
const DEFAULT_BEAD_DURATION = 100;
const BEAD_FADE_FRAMES = 6;

export const computeRetryCurve = (
  frame: number,
  props: RetryCurveProps,
): RetryCurveState => {
  const {
    from,
    control,
    to,
    drawStartFrame = 0,
    drawDurationFrames = DEFAULT_DRAW_DURATION,
    beadStartFrame,
    beadDurationFrames = DEFAULT_BEAD_DURATION,
  } = props;

  const length = quadraticLength(from, control, to);

  const drawProgress = interpolate(
    frame,
    [drawStartFrame, drawStartFrame + drawDurationFrames],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const dashoffset = (1 - drawProgress) * length;

  let bead: RetryCurveState["bead"] = null;
  if (beadStartFrame !== undefined) {
    const beadEnd = beadStartFrame + beadDurationFrames;
    if (frame >= beadStartFrame && frame <= beadEnd) {
      const t = interpolate(frame, [beadStartFrame, beadEnd], [0, 1], {
        easing: EASE_IN_OUT,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const p = sampleQuadratic(from, control, to, t);
      const fadeIn = interpolate(
        frame,
        [beadStartFrame, beadStartFrame + BEAD_FADE_FRAMES],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      const fadeOut = interpolate(
        frame,
        [beadEnd - BEAD_FADE_FRAMES, beadEnd],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      bead = { cx: p.x, cy: p.y, opacity: Math.min(fadeIn, fadeOut) };
    }
  }

  return { dashoffset, length, bead };
};

export const RetryCurve: React.FC<RetryCurveProps> = (props) => {
  const frame = useCurrentFrame();
  const {
    from,
    control,
    to,
    color = ARCH_PALETTE.amberBright,
    strokeWidth = 2.5,
    beadRadius = 5,
    beadColor,
  } = props;
  const { dashoffset, length, bead } = computeRetryCurve(frame, props);

  // SVG viewbox snap to the bezier's bounding box with padding for stroke.
  const minX = Math.min(from.x, control.x, to.x) - strokeWidth - 4;
  const minY = Math.min(from.y, control.y, to.y) - strokeWidth - 4;
  const maxX = Math.max(from.x, control.x, to.x) + strokeWidth + 4;
  const maxY = Math.max(from.y, control.y, to.y) + strokeWidth + 4;
  const w = maxX - minX;
  const h = maxY - minY;

  const d = `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`${minX} ${minY} ${w} ${h}`}
      style={{
        position: "absolute",
        left: minX,
        top: minY,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={dashoffset}
      />
      {bead !== null ? (
        <circle
          cx={bead.cx}
          cy={bead.cy}
          r={beadRadius}
          fill={beadColor ?? color}
          opacity={bead.opacity}
        />
      ) : null}
    </svg>
  );
};
