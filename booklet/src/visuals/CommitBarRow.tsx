import React from "react";
import { COLORS, FONTS } from "../theme";
import { MONTH_TICKS, WEEKLY_BUCKETS, JOURNEY } from "../content";

/**
 * Weekly commit chart, ported from `poster/src/visuals/CommitBarRow.tsx`.
 * Sizes trimmed for booklet-page scale (15pt month labels, 10pt Y-axis).
 * Used standalone on the sprint timeline spread (pages 24/25); each half
 * of the spread can slice the chart's X-range via `range`.
 */

const PEAK = 420;
const Y_STEP = 100;

const Y_MAX = Math.ceil(PEAK / Y_STEP) * Y_STEP;
const Y_TICKS = Array.from({ length: Y_MAX / Y_STEP + 1 }, (_, i) => i * Y_STEP);

const barOpacity = (index: number, isPeak: boolean) => {
  if (isPeak) return 1;
  const t = index / (WEEKLY_BUCKETS.length - 1);
  return 0.18 + Math.pow(t, 1.4) * 0.72;
};

export const CommitBarRow: React.FC<{
  width: number;
  height: number;
  /** Inclusive [startWeekIndex, endWeekIndex) slice — used by spread halves. */
  range?: [number, number];
  /** Hide peak pill on the left half of a spread. */
  hidePeak?: boolean;
}> = ({ width, height, range, hidePeak = false }) => {
  const padLeft = 46;
  const padRight = 16;
  const padTop = 32;
  const padBottom = 44;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const [startIdx, endIdx] = range ?? [0, WEEKLY_BUCKETS.length];
  const buckets = WEEKLY_BUCKETS.slice(startIdx, endIdx);
  const stride = chartW / buckets.length;
  const barW = Math.max(6, stride - 6);

  const peakGlobalIdx = WEEKLY_BUCKETS.findIndex((b) => b.count === PEAK);
  const peakInSlice = peakGlobalIdx >= startIdx && peakGlobalIdx < endIdx;
  const peakLocalIdx = peakGlobalIdx - startIdx;
  const peakX = padLeft + peakLocalIdx * stride + stride / 2;

  const yFor = (count: number) => padTop + chartH - (count / Y_MAX) * chartH;

  const PILL_W = 132;
  const PILL_H = 18;
  const PILL_GAP = 8;
  const pillTop = yFor(PEAK) - PILL_GAP - PILL_H;
  const pillLeft = Math.min(
    Math.max(peakX - PILL_W / 2, padLeft),
    width - padRight - PILL_W,
  );

  const monthTicksInSlice = MONTH_TICKS.filter(
    (m) => m.atWeek >= startIdx && m.atWeek < endIdx,
  );

  return (
    <div style={{ position: "relative", width, height, fontFamily: FONTS.SANS }}>
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
                height: 0.5,
                background: isBaseline ? COLORS.HAIRLINE_STRONG : COLORS.HAIRLINE,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: y - 6,
                width: padLeft - 8,
                textAlign: "right",
                fontSize: 9,
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

      {buckets.map((b, i) => {
        const y = yFor(b.count);
        const h = padTop + chartH - y;
        const x = padLeft + i * stride + (stride - barW) / 2;
        const globalIdx = startIdx + i;
        const isPeak = globalIdx === peakGlobalIdx;
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
              opacity: barOpacity(globalIdx, isPeak),
              borderRadius: "2px 2px 0 0",
            }}
          />
        );
      })}

      {monthTicksInSlice.map((m) => {
        const cx = padLeft + (m.atWeek - startIdx) * stride + stride / 2;
        return (
          <React.Fragment key={`m-${m.label}`}>
            <div
              style={{
                position: "absolute",
                left: cx - 0.25,
                top: padTop + chartH + 1,
                width: 0.5,
                height: 3,
                background: COLORS.HAIRLINE_STRONG,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: cx - 24,
                top: padTop + chartH + 7,
                width: 48,
                textAlign: "center",
                fontSize: 10,
                fontWeight: 700,
                color: COLORS.INK,
                letterSpacing: "0.01em",
              }}
            >
              {m.label}
            </div>
          </React.Fragment>
        );
      })}

      {!hidePeak && peakInSlice && (
        <>
          <div
            style={{
              position: "absolute",
              left: peakX - 0.25,
              top: pillTop + PILL_H,
              width: 0.5,
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
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.01em",
            }}
          >
            {JOURNEY.peakCallout}
          </div>
        </>
      )}
    </div>
  );
};
