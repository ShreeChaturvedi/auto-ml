import React from "react";
import { COLORS, FONTS } from "../tokens";
import { MONTH_TICKS, WEEKLY_BUCKETS, JOURNEY } from "../content";

/**
 * Weekly commit chart, production-grade analytics style.
 *
 *   - Miami-red ramp: every bar is MIAMI_RED; opacity scales with
 *     position so early foundation weeks read faint and the Apr 5 peak
 *     reads full saturation. Single-palette, no sprint colors.
 *   - Real Y-axis with numeric ticks (auto-stepped to nearest 100) and
 *     hairline gridlines. Real X-axis baseline with tick marks under
 *     each month label.
 *   - Peak callout is a rounded red pill with white sans-serif text,
 *     anchored to the peak bar via a thin red leader line.
 *   - Plus Jakarta Sans for every label. No monospace.
 */

const PEAK = Math.max(...WEEKLY_BUCKETS.map((b) => b.count));
const PEAK_INDEX = WEEKLY_BUCKETS.findIndex((b) => b.count === PEAK);
const Y_STEP = 100;

// Auto-scale Y-axis: round peak up to next Y_STEP, then build ticks.
const Y_MAX = Math.ceil(PEAK / Y_STEP) * Y_STEP; // 500
const Y_TICKS = Array.from({ length: Y_MAX / Y_STEP + 1 }, (_, i) => i * Y_STEP);

/** Opacity ramp — earliest week 0.18, peak 1.0, post-peak 0.85. */
const barOpacity = (index: number, isPeak: boolean) => {
  if (isPeak) return 1;
  const t = index / (WEEKLY_BUCKETS.length - 1);
  // ease-in so the early weeks stay clearly subdued
  return 0.18 + Math.pow(t, 1.4) * 0.72;
};

export const CommitBarRow: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {
  // Generous left gutter for Y-axis numerals, bottom gutter for month
  // labels + caption, top space for the peak pill.
  const padLeft = 86;
  const padRight = 28;
  const padTop = 60;
  const padBottom = 92;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const stride = chartW / WEEKLY_BUCKETS.length;
  const barW = Math.max(10, stride - 10);

  const peakX = padLeft + PEAK_INDEX * stride + stride / 2;

  const yFor = (count: number) => padTop + chartH - (count / Y_MAX) * chartH;

  // Pill geometry: centered above the peak bar, clamped inside the chart.
  const PILL_W = 248;
  const PILL_H = 32;
  const PILL_GAP = 14; // leader line length between pill and bar
  const pillTop = yFor(PEAK) - PILL_GAP - PILL_H;
  const pillLeft = Math.min(
    Math.max(peakX - PILL_W / 2, padLeft),
    width - padRight - PILL_W,
  );

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        fontFamily: FONTS.SANS,
      }}
    >
      {/* ---------- Gridlines + Y-axis tick labels ---------- */}
      {Y_TICKS.map((tick) => {
        const y = yFor(tick);
        const isBaseline = tick === 0;
        return (
          <React.Fragment key={tick}>
            <div
              style={{
                position: "absolute",
                left: padLeft,
                top: y,
                width: chartW,
                height: 1,
                background: isBaseline
                  ? COLORS.HAIRLINE_STRONG
                  : COLORS.HAIRLINE,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: y - 12,
                width: padLeft - 14,
                textAlign: "right",
                fontSize: 19,
                fontWeight: 600,
                color: COLORS.INK_MUTED,
                letterSpacing: "0.01em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {tick}
            </div>
          </React.Fragment>
        );
      })}

      {/* ---------- Bars (Miami-red ramp) ---------- */}
      {WEEKLY_BUCKETS.map((b, i) => {
        const y = yFor(b.count);
        const h = padTop + chartH - y;
        const x = padLeft + i * stride + (stride - barW) / 2;
        const isPeak = i === PEAK_INDEX;
        return (
          <div
            key={b.week}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: barW,
              height: h,
              background: COLORS.MIAMI_RED,
              opacity: barOpacity(i, isPeak),
              borderRadius: "3px 3px 0 0",
            }}
          />
        );
      })}

      {/* ---------- X-axis tick marks under month labels ---------- */}
      {MONTH_TICKS.map((m) => {
        const cx = padLeft + m.atWeek * stride + stride / 2;
        return (
          <div
            key={`tick-${m.label}`}
            style={{
              position: "absolute",
              left: cx - 0.5,
              top: padTop + chartH + 1,
              width: 1,
              height: 6,
              background: COLORS.HAIRLINE_STRONG,
            }}
          />
        );
      })}

      {/* ---------- Month labels (x-axis) ---------- */}
      {MONTH_TICKS.map((m) => {
        const cx = padLeft + m.atWeek * stride + stride / 2;
        return (
          <div
            key={`label-${m.label}`}
            style={{
              position: "absolute",
              left: cx - 48,
              top: padTop + chartH + 14,
              width: 96,
              textAlign: "center",
              fontSize: 20,
              fontWeight: 700,
              color: COLORS.INK,
              letterSpacing: "0.01em",
            }}
          >
            {m.label}
          </div>
        );
      })}

      {/* ---------- Peak callout pill + leader line ---------- */}
      {PEAK_INDEX >= 0 && (
        <>
          {/* leader line from pill bottom to bar top */}
          <div
            style={{
              position: "absolute",
              left: peakX - 0.5,
              top: pillTop + PILL_H,
              width: 1,
              height: PILL_GAP,
              background: COLORS.MIAMI_RED,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: pillLeft,
              top: pillTop,
              width: PILL_W,
              height: PILL_H,
              background: COLORS.MIAMI_RED,
              borderRadius: PILL_H / 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.PAPER,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.01em",
              boxShadow: `0 1px 2px ${COLORS.MIAMI_RED_TINT_STRONG}`,
            }}
          >
            {JOURNEY.peakCallout}
          </div>
        </>
      )}

      {/* ---------- Caption (replaces the old 3-color legend) ---------- */}
      <div
        style={{
          position: "absolute",
          left: padLeft,
          bottom: 8,
          fontSize: 15,
          fontWeight: 700,
          color: COLORS.INK_MUTED,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Commits per week · Dec 2025 → Apr 2026
      </div>
    </div>
  );
};
