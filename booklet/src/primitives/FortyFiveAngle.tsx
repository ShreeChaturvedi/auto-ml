import React from "react";
import { COLORS } from "../theme";

/**
 * Recurring structural device — a hairline 45° rule used to:
 *   · crop screenshot corners on phase pages (as a decorative slash)
 *   · divide the Before/With columns on page 07
 *   · separate diagram zones inside INSIDE pages
 *
 * Rendered as an SVG line so stroke weight stays crisp at print scale.
 */
export const FortyFiveAngle: React.FC<{
  /** Length of the rule along the diagonal, in px. */
  length: number;
  /** Absolute placement inside the parent container. */
  top: number;
  left: number;
  color?: string;
  strokeWidth?: number;
  /** "down" goes ↘, "up" goes ↗. */
  direction?: "down" | "up";
}> = ({
  length,
  top,
  left,
  color = COLORS.INK,
  strokeWidth = 0.75,
  direction = "down",
}) => {
  const dx = length / Math.SQRT2;
  const dy = length / Math.SQRT2;
  const y2 = direction === "down" ? dy : -dy;
  const svgTop = direction === "down" ? 0 : -dy;
  return (
    <svg
      width={dx}
      height={dy}
      viewBox={`0 ${svgTop} ${dx} ${dy}`}
      style={{
        position: "absolute",
        top,
        left,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <line
        x1={0}
        y1={0}
        x2={dx}
        y2={y2}
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
};
