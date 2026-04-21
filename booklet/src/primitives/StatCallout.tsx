import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * Compact 3-row stat strip for phase pages. Renders each row as a label
 * eyebrow (Monaspace UPPERCASE, tracked 0.12em) stacked above the value
 * (Monaspace, bold, larger). Total block fits inside a ~3.3in column.
 *
 * Visually this is the book's "data strip" — the thing a reader's eye
 * lands on when they want a one-glance picture of the phase's numbers.
 */
export const StatCallout: React.FC<{
  rows: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  accent?: string;
  style?: React.CSSProperties;
}> = ({ rows, accent = COLORS.INK, style }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      padding: "10px 12px",
      borderLeft: `2px solid ${accent}`,
      ...style,
    }}
  >
    {rows.map((row) => (
      <div
        key={row.label}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
            lineHeight: 1,
          }}
        >
          {row.label}
        </div>
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: COLORS.INK,
            lineHeight: 1.2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.value}
        </div>
      </div>
    ))}
  </div>
);
