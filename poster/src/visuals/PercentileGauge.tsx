import React from "react";
import { COLORS, FONTS } from "../tokens";

/**
 * Percentile gauge — fluid-width track with a marker at `rank` and a baseline
 * notch at `baselineRank`. The 90–100 region is washed in the accent so the
 * "top tier" is legible at a glance. Designed to sit inside the shared
 * §4 ChartCard, so it has no chrome of its own — it relies on the wrapper
 * for padding and border.
 *
 * Axis ticks (12px MONO INK_MUTED) match the other §4 visuals.
 */

export type PercentileGaugeProps = {
  rank: number;
  baselineRank?: number;
  trackHeight?: number;
  topTierThreshold?: number;
  /** Tier accent — defaults to SUCCESS for Quality. */
  accent?: string;
};

export const PercentileGauge: React.FC<PercentileGaugeProps> = ({
  rank,
  baselineRank,
  trackHeight = 18,
  topTierThreshold = 90,
  accent = COLORS.SUCCESS,
}) => {
  const radius = trackHeight / 2;
  const calloutText = `TOP ${100 - Math.round(rank)}%`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: trackHeight + 64,
      }}
    >
      {/* Callout — 18pt MONO 700, tier accent, sits above the marker */}
      <div
        style={{
          position: "absolute",
          left: `${rank}%`,
          top: 0,
          transform: "translateX(-50%)",
          fontFamily: FONTS.MONO,
          fontSize: 18,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: accent,
          letterSpacing: "-0.01em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {calloutText}
      </div>

      {/* Track */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 26,
          width: "100%",
          height: trackHeight,
          background: COLORS.SURFACE,
          borderRadius: radius,
          overflow: "hidden",
        }}
      >
        {/* Filled portion (rank) */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: `${rank}%`,
            height: "100%",
            background: COLORS.INK,
            opacity: 0.85,
          }}
        />
        {/* Top-tier wash */}
        <div
          style={{
            position: "absolute",
            left: `${topTierThreshold}%`,
            top: 0,
            width: `${100 - topTierThreshold}%`,
            height: "100%",
            background: accent,
            opacity: 0.18,
          }}
        />
      </div>

      {/* Baseline notch */}
      {baselineRank !== undefined && (
        <div
          style={{
            position: "absolute",
            left: `${baselineRank}%`,
            top: 18,
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderBottom: `7px solid ${COLORS.INK_MUTED}`,
          }}
        />
      )}

      {/* Marker dot */}
      <div
        style={{
          position: "absolute",
          left: `${rank}%`,
          top: 26 + trackHeight / 2 - 9,
          transform: "translateX(-50%)",
          width: 18,
          height: 18,
          borderRadius: 9,
          background: accent,
          border: `2px solid ${COLORS.PAPER}`,
          boxShadow: `0 0 0 1px ${accent}`,
        }}
      />

      {/* Axis ticks — same style as SpeedBarChart axis */}
      {[0, 25, 50, 75, 100].map((tick) => (
        <React.Fragment key={tick}>
          <div
            style={{
              position: "absolute",
              left: `${tick}%`,
              top: 26 + trackHeight + 4,
              width: 1,
              height: 4,
              background: COLORS.HAIRLINE_STRONG,
              transform: "translateX(-50%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${tick}%`,
              top: 26 + trackHeight + 12,
              transform: "translateX(-50%)",
              fontFamily: FONTS.SANS,
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.INK_MUTED,
              letterSpacing: "0.08em",
              lineHeight: 1,
            }}
          >
            {tick}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};
