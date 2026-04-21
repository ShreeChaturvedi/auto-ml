import React from "react";
import { COLORS, FONTS } from "../theme";
import { SPEED_ROWS } from "../content";
import { ChartCard } from "./ChartCard";

/**
 * 5-row Ours-vs-Jupyter bar comparison, ported from
 * `poster/src/visuals/SpeedBarChart.tsx`. Sizes trimmed for booklet scale:
 * 40pt rows instead of 48, 14pt label font instead of 16, 8pt datacell
 * instead of 18.
 */

const SCALE_MAX = 40;
const ROW_H = 40;
const ROW_GAP = 6;
const LABEL_W = 120;
const VALUE_W = 52;
const BAR_PRIMARY_H = 10;
const BAR_GHOST_H = 4;
const BAR_STACK_GAP = 6;

export const SpeedBarChart: React.FC<{ accent?: string }> = ({
  accent = COLORS.MIAMI_RED,
}) => (
  <ChartCard>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${LABEL_W}px 1fr ${VALUE_W}px`,
        columnGap: 12,
        alignItems: "center",
        paddingBottom: 6,
        borderBottom: `0.5pt solid ${COLORS.HAIRLINE}`,
      }}
    >
      <div style={axisLabelStyle}>Dataset</div>
      <div style={{ ...axisLabelStyle, paddingLeft: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <LegendSwatch color={accent} h={BAR_PRIMARY_H} label="Ours" />
          <LegendSwatch color={COLORS.NEUTRAL_500} h={BAR_GHOST_H} label="Jupyter" />
        </span>
      </div>
      <div style={{ ...axisLabelStyle, textAlign: "right" }}>Time</div>
    </div>

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: ROW_GAP,
        paddingTop: 6,
      }}
    >
      {SPEED_ROWS.map((row) => (
        <SpeedRow key={row.dataset} row={row} accent={accent} />
      ))}
    </div>

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
      columnGap: 12,
      alignItems: "center",
      height: ROW_H,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 11,
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
          fontSize: 8,
          fontWeight: 500,
          color: COLORS.INK_MUTED,
          letterSpacing: "0.04em",
          lineHeight: 1,
        }}
      >
        {row.rows}
      </div>
    </div>

    <div style={{ position: "relative", height: ROW_H }}>
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

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 1,
        textAlign: "right",
      }}
    >
      <div style={dataLabelStyle(accent)}>{row.us.toFixed(1)}m</div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 8,
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
      columnGap: 12,
      paddingTop: 6,
      borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
      marginTop: 6,
    }}
  >
    <div />
    <div style={{ position: "relative", height: 10 }}>
      {[0, 10, 20, 30, 40].map((tick) => (
        <div
          key={tick}
          style={{
            position: "absolute",
            left: `${(tick / SCALE_MAX) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
            fontFamily: FONTS.SANS,
            fontSize: 8,
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

const axisLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.SANS,
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: COLORS.INK_MUTED,
  lineHeight: 1,
};

const dataLabelStyle = (color: string): React.CSSProperties => ({
  fontFamily: FONTS.MONO,
  fontSize: 12,
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
      gap: 5,
      fontFamily: FONTS.SANS,
      fontSize: 8,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: COLORS.INK_MUTED,
    }}
  >
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: h,
        background: color,
        borderRadius: h / 2,
      }}
    />
    {label}
  </span>
);
