import React from "react";
import { COLORS, FONTS } from "../tokens";
import { SPEED_ROWS } from "../content";
import { ChartCard } from "./ChartCard";

/**
 * Five-row bar comparison wrapped in the shared ChartCard. Ours is the
 * dominant primary bar in the tier accent (INK); Jupyter sits below it as a
 * thinner ghost stroke. All numbers right-align on the same axis using the
 * unified data-label style (18px MONO 700 tabular-nums).
 *
 * Spacing rhythm: 8px grid throughout (row height 48 = 6 × 8).
 */

const SCALE_MAX = 40; // minutes
const ROW_H = 48;
const ROW_GAP = 8;
const LABEL_W = 168;
const VALUE_W = 64;
// Primary bar — slimmed ~10% from the old 16px so the row reads less dense.
const BAR_PRIMARY_H = 14;
const BAR_GHOST_H = 6;
const BAR_STACK_GAP = 8;

export const SpeedBarChart: React.FC<{ accent?: string }> = ({
  accent = COLORS.MIAMI_RED,
}) => (
  <ChartCard>
    {/* Header / column labels — same axis style as other charts */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${LABEL_W}px 1fr ${VALUE_W}px`,
        columnGap: 16,
        alignItems: "center",
        paddingBottom: 8,
        borderBottom: `1px solid ${COLORS.HAIRLINE}`,
      }}
    >
      <div style={axisLabelStyle}>Dataset</div>
      <div style={{ ...axisLabelStyle, paddingLeft: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
          <LegendSwatch color={accent} h={BAR_PRIMARY_H} label="Ours" />
          <LegendSwatch
            color={COLORS.NEUTRAL_500}
            h={BAR_GHOST_H}
            label="Jupyter"
          />
        </span>
      </div>
      <div style={{ ...axisLabelStyle, textAlign: "right" }}>Time</div>
    </div>

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: ROW_GAP,
        paddingTop: 8,
      }}
    >
      {SPEED_ROWS.map((row) => (
        <SpeedRow key={row.dataset} row={row} accent={accent} />
      ))}
    </div>

    {/* X-axis ticks (minutes) */}
    <AxisTicks />
  </ChartCard>
);

const SpeedRow: React.FC<{
  row: (typeof SPEED_ROWS)[number];
  accent: string;
}> = ({ row, accent }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `${LABEL_W}px 1fr ${VALUE_W}px`,
      columnGap: 16,
      alignItems: "center",
      height: ROW_H,
    }}
  >
    {/* Dataset label + row count */}
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 16,
          fontWeight: 600,
          color: COLORS.INK,
          letterSpacing: "-0.005em",
          lineHeight: 1.15,
        }}
      >
        {row.dataset}
      </div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 12,
          fontWeight: 500,
          color: COLORS.INK_MUTED,
          letterSpacing: "0.04em",
          lineHeight: 1,
        }}
      >
        {row.rows}
      </div>
    </div>

    {/* Stacked bars (primary on top, ghost below) */}
    <div style={{ position: "relative", height: ROW_H }}>
      {/* Primary track */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: (ROW_H - BAR_STACK_GAP - BAR_PRIMARY_H - BAR_GHOST_H) / 2,
          width: "100%",
          height: BAR_PRIMARY_H,
          background: COLORS.SURFACE,
          borderRadius: BAR_PRIMARY_H / 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: (ROW_H - BAR_STACK_GAP - BAR_PRIMARY_H - BAR_GHOST_H) / 2,
          width: `${(row.us / SCALE_MAX) * 100}%`,
          height: BAR_PRIMARY_H,
          background: accent,
          borderRadius: BAR_PRIMARY_H / 2,
        }}
      />

      {/* Ghost track (Jupyter) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top:
            (ROW_H - BAR_STACK_GAP - BAR_PRIMARY_H - BAR_GHOST_H) / 2 +
            BAR_PRIMARY_H +
            BAR_STACK_GAP,
          width: "100%",
          height: BAR_GHOST_H,
          background: COLORS.SURFACE,
          borderRadius: BAR_GHOST_H / 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top:
            (ROW_H - BAR_STACK_GAP - BAR_PRIMARY_H - BAR_GHOST_H) / 2 +
            BAR_PRIMARY_H +
            BAR_STACK_GAP,
          width: `${(row.jupyter / SCALE_MAX) * 100}%`,
          height: BAR_GHOST_H,
          background: COLORS.NEUTRAL_500,
          borderRadius: BAR_GHOST_H / 2,
        }}
      />
    </div>

    {/* Right-aligned data labels — unified data-label style */}
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 2,
        textAlign: "right",
      }}
    >
      <div style={dataLabelStyle(accent)}>{row.us.toFixed(1)}m</div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 12,
          fontWeight: 500,
          color: COLORS.INK_MUTED,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {row.jupyter}m
      </div>
    </div>
  </div>
);

const AxisTicks: React.FC = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `${LABEL_W}px 1fr ${VALUE_W}px`,
      columnGap: 16,
      paddingTop: 8,
      borderTop: `1px solid ${COLORS.HAIRLINE}`,
      marginTop: 8,
    }}
  >
    <div />
    <div style={{ position: "relative", height: 14 }}>
      {[0, 10, 20, 30, 40].map((tick) => (
        <div
          key={tick}
          style={{
            position: "absolute",
            left: `${(tick / SCALE_MAX) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
            fontFamily: FONTS.SANS,
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.INK_MUTED,
            letterSpacing: "0.08em",
            lineHeight: 1,
          }}
        >
          {tick}m
        </div>
      ))}
    </div>
    <div />
  </div>
);

// ---------------------------------------------------------------------------
// Shared style atoms — kept in the same file so the visual stays self-contained
// while still pulling tokens from the unified system.
// ---------------------------------------------------------------------------

const axisLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.SANS,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: COLORS.INK_MUTED,
  lineHeight: 1,
};

const dataLabelStyle = (color: string): React.CSSProperties => ({
  fontFamily: FONTS.MONO,
  fontSize: 18,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color,
  letterSpacing: "-0.01em",
  lineHeight: 1,
});

const LegendSwatch: React.FC<{ color: string; h: number; label: string }> = ({
  color,
  h,
  label,
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontFamily: FONTS.SANS,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: COLORS.INK_MUTED,
    }}
  >
    <span
      style={{
        display: "inline-block",
        width: 16,
        height: h,
        background: color,
        borderRadius: h / 2,
      }}
    />
    {label}
  </span>
);
