import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * Percentile gauge ported from `poster/src/visuals/PercentileGauge.tsx`.
 * Draws a fluid-width track with a marker at `rank` and (optional) baseline
 * notch. The 90-100 wash is the "top tier" highlight. Sizes trimmed for
 * booklet scale.
 */

export type PercentileGaugeProps = {
  rank: number;
  baselineRank?: number;
  trackHeight?: number;
  topTierThreshold?: number;
  accent?: string;
};

export const PercentileGauge: React.FC<PercentileGaugeProps> = ({
  rank,
  baselineRank,
  trackHeight = 10,
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
        height: trackHeight + 40,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${rank}%`,
          top: 0,
          transform: "translateX(-50%)",
          fontFamily: FONTS.MONO,
          fontSize: 11,
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

      <div
        style={{
          position: "absolute",
          left: 0,
          top: 16,
          width: "100%",
          height: trackHeight,
          background: COLORS.SURFACE,
          borderRadius: radius,
          overflow: "hidden",
        }}
      >
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

      {baselineRank !== undefined && (
        <div
          style={{
            position: "absolute",
            left: `${baselineRank}%`,
            top: 10,
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "3px solid transparent",
            borderRight: "3px solid transparent",
            borderBottom: `4px solid ${COLORS.INK_MUTED}`,
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: `${rank}%`,
          top: 16 + trackHeight / 2 - 5,
          transform: "translateX(-50%)",
          width: 10,
          height: 10,
          borderRadius: 5,
          background: accent,
          border: `1pt solid ${COLORS.PAPER}`,
          boxShadow: `0 0 0 0.5pt ${accent}`,
        }}
      />

      {[0, 25, 50, 75, 100].map((tick) => (
        <React.Fragment key={tick}>
          <div
            style={{
              position: "absolute",
              left: `${tick}%`,
              top: 16 + trackHeight + 3,
              width: 0.5,
              height: 3,
              background: COLORS.HAIRLINE_STRONG,
              transform: "translateX(-50%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${tick}%`,
              top: 16 + trackHeight + 8,
              transform: "translateX(-50%)",
              fontFamily: FONTS.SANS,
              fontSize: 8,
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
