import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../config/easing";

export type MotionLineProps = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Delay in frames before draw begins. Default 0. */
  delay?: number;
  /** Draw duration in frames. Default 48 (800ms @60fps — matches app `.sparkline-draw`). */
  durationInFrames?: number;
  strokeWidth?: number;
  /** Stroke color. Caller-supplied (no theme-awareness inside the primitive). */
  color?: string;
  /** Positioning passthrough (absolute positioning inside a parent). */
  style?: React.CSSProperties;
  /**
   * Override the SVG canvas size. When omitted the SVG sizes to the line's
   * bounding box (max of x1/x2, max of y1/y2), so callers can place the
   * primitive with style props.
   */
  svgWidth?: number;
  svgHeight?: number;
};

/**
 * Animates an SVG line via `strokeDashoffset`. Mirrors the app's
 * `.stroke-draw-on` pattern (`ui-utilities.css:138-142`): dasharray set to
 * the length, dashoffset interpolated from length → 0 across the duration.
 *
 * Default 48f (800ms) and EASE_OUT match the app's `sparkline-draw` timing.
 */
export const MotionLine: React.FC<MotionLineProps> = ({
  x1,
  y1,
  x2,
  y2,
  delay = 0,
  durationInFrames = 48,
  strokeWidth = 1,
  color = "currentColor",
  style,
  svgWidth,
  svgHeight,
}) => {
  const frame = useCurrentFrame();
  const length = Math.hypot(x2 - x1, y2 - y1);
  const progress = interpolate(
    frame,
    [delay, delay + durationInFrames],
    [0, 1],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const dashoffset = (1 - progress) * length;

  const width = svgWidth ?? Math.max(x1, x2) + strokeWidth;
  const height = svgHeight ?? Math.max(y1, y2) + strokeWidth;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: "visible", ...style }}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={dashoffset}
      />
    </svg>
  );
};
