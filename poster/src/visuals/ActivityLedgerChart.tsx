import React from "react";
import { COLORS, FONTS } from "../tokens";
import { ACTIVITY_ROWS } from "../content";

/**
 * Activity ledger chart from Anaconda 2022. Ported from
 * `video/remotion/scenes/Slide/HookSlide.tsx:364-542` without animation.
 * The Model-training row renders Miami Red to rhyme with the 80% hero
 * statistic; the remaining rows step down through five neutral greys.
 *
 * Defaults are tuned for a 48"×36" expo poster — large labels, wide track,
 * and a 25% reference gridline so the percentages have visual context.
 */

const TRACK_MAX_PCT = 30; // even 26% has headroom so no bar saturates
const GRIDLINE_PCT = 25; // dotted reference rule — context for the eye
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
  labelWidth = 320,
  trackWidth = 860,
  rowHeight = 70,
  fontSize = 30,
  pctFontSize = 30,
  barHeight = 18,
}) => {
  const pctColumnWidth = 90;
  const totalWidth = labelWidth + trackWidth + pctColumnWidth + 24;
  const gridlineLeft = labelWidth + (GRIDLINE_PCT / TRACK_MAX_PCT) * trackWidth;

  return (
    <div
      style={{
        width: totalWidth,
        marginLeft: "auto",
        marginRight: "auto",
        position: "relative",
      }}
    >
      {/* Dotted 25% reference rule — sits behind the bars so the hero
       *  Miami-red row visibly crosses it. Uses NEUTRAL_600 so the line
       *  actually reads at 5ft instead of vanishing into the page. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: gridlineLeft,
          top: 0,
          bottom: 28,
          width: 0,
          borderLeft: `2px dotted ${COLORS.NEUTRAL_600}`,
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
          fontSize: 18,
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
          gap: 12,
          position: "relative",
        }}
      >
        {ACTIVITY_ROWS.map((row, i) => {
          const color = row.hero
            ? COLORS.MIAMI_RED
            : (NEUTRAL_COLORS[i] ?? COLORS.INK);
          const fillWidth = (row.pct / TRACK_MAX_PCT) * trackWidth;
          const labelColor = row.hero ? COLORS.MIAMI_RED : COLORS.INK;
          const thisBarHeight = row.hero ? barHeight + 4 : barHeight;
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
                  marginLeft: 24,
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
