import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * 6-pill horizontal progress band showing where the reader is in the
 * workflow. Active phase renders as a filled accent pill with white
 * label; inactive phases are outlined with muted labels. Reads at arm's
 * length because the labels stay above the eyebrow tracking threshold.
 *
 * Props:
 *  - labels: one per pill, in workflow order (Upload, Explore, Preprocess, …)
 *  - current: 0-based index of the phase this page represents
 *  - accent: filled pill color — defaults to the HOW section accent
 */
export const MiniProgressBand: React.FC<{
  labels: ReadonlyArray<string>;
  current: number;
  accent?: string;
  style?: React.CSSProperties;
}> = ({ labels, current, accent = COLORS.ACCENT, style }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${labels.length}, 1fr)`,
      gap: 6,
      width: "100%",
      ...style,
    }}
  >
    {labels.map((label, i) => {
      const isActive = i === current;
      const isDone = i < current;
      return (
        <div
          key={label}
          style={{
            height: 20,
            borderRadius: 10,
            background: isActive ? accent : COLORS.PAPER,
            border: `0.75pt solid ${isActive || isDone ? accent : COLORS.HAIRLINE}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 8px",
            fontFamily: FONTS.MONO,
            fontSize: 7.5,
            fontWeight: isActive ? 700 : 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: isActive
              ? COLORS.PAPER
              : isDone
                ? COLORS.INK
                : COLORS.INK_MUTED,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span style={{ opacity: 0.6, marginRight: 4, fontWeight: 500 }}>
            0{i + 1}
          </span>
          {label}
        </div>
      );
    })}
  </div>
);
