import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export type ConicTraceProps = {
  /** Cycle length in frames — one complete trace. Default 75 (1.25 s @ 60 fps). */
  cycleFrames?: number;
  /** Start frame of first cycle. */
  startFrame?: number;
  /** Stroke color for the moving trail. */
  strokeColor?: string;
  /** Background trail color (full-length stroke under the moving cap). */
  trailColor?: string;
  /** Container width/height in px — should match the pill bounding box. */
  width: number;
  height: number;
  /** Corner radius of the rounded rectangle. Default height/2 (pill). */
  borderRadius?: number;
  /** Stroke width. Default 2. */
  strokeWidth?: number;
};

/**
 * Perimeter length of a rounded rectangle with corner radius r:
 *   2*(w + h) - 8*r + 2*π*r
 * (straight sides minus the corner chunks replaced by quarter-circle arcs).
 */
export const roundedRectPerimeter = (
  w: number,
  h: number,
  r: number,
): number => 2 * (w + h) - 8 * r + 2 * Math.PI * r;

/**
 * Traced conic-gradient arc for the landing hero announcement pill
 * (see `landing/src/components/Hero.astro:119,138-142`).
 *
 * Uses an SVG `<rect>` with strokeDasharray + strokeDashoffset — NOT
 * `@property --pill-sweep` CSS variables, which are unsupported in headless
 * Chrome. The dashoffset sweeps a visible stroke-window around the pill's
 * perimeter, matching the landing's `hero-pill-trace` cadence.
 */
export const ConicTrace: React.FC<ConicTraceProps> = ({
  cycleFrames = 75,
  startFrame = 0,
  strokeColor = "hsl(0 0% 38%)",
  trailColor = "rgba(255, 255, 255, 0.1)",
  width,
  height,
  borderRadius,
  strokeWidth = 2,
}) => {
  const frame = useCurrentFrame();
  const r = borderRadius ?? height / 2;
  const pathLen = roundedRectPerimeter(width, height, r);

  const t = ((frame - startFrame) % cycleFrames + cycleFrames) % cycleFrames;
  const progress = interpolate(t, [0, cycleFrames], [0, pathLen]);

  const insetX = strokeWidth / 2;
  const insetY = strokeWidth / 2;
  const rectW = width - strokeWidth;
  const rectH = height - strokeWidth;
  const rectR = Math.max(0, r - strokeWidth / 2);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: "visible", pointerEvents: "none" }}
      aria-hidden="true"
    >
      <rect
        x={insetX}
        y={insetY}
        width={rectW}
        height={rectH}
        rx={rectR}
        fill="none"
        stroke={trailColor}
        strokeWidth={strokeWidth}
      />
      <rect
        x={insetX}
        y={insetY}
        width={rectW}
        height={rectH}
        rx={rectR}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={pathLen}
        strokeDashoffset={pathLen - progress}
        strokeLinecap="round"
      />
    </svg>
  );
};
