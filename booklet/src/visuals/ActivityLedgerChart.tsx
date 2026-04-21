import React from "react";
import { COLORS, FONTS } from "../theme";
import { ACTIVITY_ROWS } from "../content";

/**
 * Anaconda 2022 activity ledger chart, ported from
 * `poster/src/visuals/ActivityLedgerChart.tsx`. Renders horizontally with
 * the Model-training row in Miami Red and the remaining five rows stepping
 * through neutral greys. Sizes trimmed for booklet-page scale.
 */

const TRACK_MAX_PCT = 30;
const GRIDLINE_PCT = 25;
const NEUTRAL_COLORS = [
  "#262626",
  "#4A4A4A",
  "#6B6B6B",
  "#8A8A8A",
  "#B0B0B0",
];

export const ActivityLedgerChart: React.FC<{
  labelWidth?: number;
  trackWidth?: number;
  rowHeight?: number;
  fontSize?: number;
  pctFontSize?: number;
  barHeight?: number;
}> = ({
  labelWidth = 120,
  trackWidth = 300,
  rowHeight = 26,
  fontSize = 11,
  pctFontSize = 12,
  barHeight = 8,
}) => {
  const pctColumnWidth = 36;
  const totalWidth = labelWidth + trackWidth + pctColumnWidth + 10;
  const gridlineLeft = labelWidth + (GRIDLINE_PCT / TRACK_MAX_PCT) * trackWidth;

  return (
    <div style={{ width: totalWidth, position: "relative" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: gridlineLeft,
          top: 0,
          bottom: 16,
          width: 0,
          borderLeft: `1pt dotted ${COLORS.NEUTRAL_600}`,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: gridlineLeft,
          bottom: 0,
          transform: "translateX(-50%)",
          fontFamily: FONTS.SANS,
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: COLORS.NEUTRAL_600,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        25% ref
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          position: "relative",
        }}
      >
        {ACTIVITY_ROWS.map((row, i) => {
          const color = row.hero
            ? COLORS.MIAMI_RED
            : (NEUTRAL_COLORS[i] ?? COLORS.INK);
          const fillWidth = (row.pct / TRACK_MAX_PCT) * trackWidth;
          const labelColor = row.hero ? COLORS.MIAMI_RED : COLORS.INK;
          const thisBarHeight = row.hero ? barHeight + 2 : barHeight;
          const radius = thisBarHeight / 2;
          return (
            <div
              key={row.label}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                height: rowHeight,
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.SANS,
                  fontSize,
                  fontWeight: row.hero ? 700 : 500,
                  width: labelWidth,
                  color: labelColor,
                  letterSpacing: "-0.005em",
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  width: trackWidth,
                  height: thisBarHeight,
                  background: COLORS.SURFACE,
                  borderRadius: radius,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: fillWidth,
                    height: "100%",
                    background: color,
                    borderRadius: radius,
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: pctFontSize,
                  fontWeight: row.hero ? 700 : 500,
                  fontVariantNumeric: "tabular-nums",
                  width: pctColumnWidth,
                  marginLeft: 10,
                  textAlign: "right",
                  color,
                  letterSpacing: "-0.01em",
                }}
              >
                {row.pct}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
