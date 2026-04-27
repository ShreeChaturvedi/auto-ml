import React from "react";
import { COLORS } from "../theme";

/**
 * Static hand-drawn Bezier arrow, ported from
 * `video/remotion/scenes/Slide/ClosingSlide.tsx:270-278` — shaft + two head
 * segments. The original Remotion version animates the dashOffset from 1→0;
 * here the arrow is always fully drawn (offset=0, dasharray=1).
 *
 * `direction="left"` means the arrow points to the left (head on the left,
 * shaft sweeps in from the right) — that's the `LEFT_ARROW_*` path data.
 * `direction="right"` uses `RIGHT_ARROW_*` and points to the right.
 */

const ARROW_STROKE_WIDTH = 2.25;

const LEFT_SHAFT =
  "M 6 34 C 60 52, 130 48, 200 40 C 260 34, 320 30, 372 32";
const LEFT_HEAD_UPPER = "M 372 32 L 356 24";
const LEFT_HEAD_LOWER = "M 372 32 L 358 41";

const RIGHT_SHAFT =
  "M 392 34 C 330 18, 260 22, 190 30 C 130 37, 70 38, 14 32";
const RIGHT_HEAD_UPPER = "M 14 32 L 30 24";
const RIGHT_HEAD_LOWER = "M 14 32 L 29 41";

type Direction = "left" | "right";

export const HandDrawnArrow: React.FC<{
  direction?: Direction;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}> = ({
  direction = "right",
  width = 160,
  height = 28,
  color = COLORS.INK,
  strokeWidth = ARROW_STROKE_WIDTH,
  style,
}) => {
  const shaft = direction === "left" ? LEFT_SHAFT : RIGHT_SHAFT;
  const headU = direction === "left" ? LEFT_HEAD_UPPER : RIGHT_HEAD_UPPER;
  const headL = direction === "left" ? LEFT_HEAD_LOWER : RIGHT_HEAD_LOWER;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 400 70"
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: "visible", ...style }}
    >
      <path
        d={shaft}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={headU}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={headL}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
