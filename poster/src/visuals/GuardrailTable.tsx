import React from "react";
import { COLORS, FONTS } from "../tokens";
import { GUARDRAIL, GUARDRAIL_ROWS } from "../content";
import { ChartCard } from "./ChartCard";

/**
 * Guardrail evidence — 5 representative flaws table + 2 summary bars,
 * wrapped in the shared ChartCard chrome. Status uses small colored dots
 * (no glyphs). Column headers and summary labels use the same axis/data-label
 * styles as SpeedBarChart so all three §4 visuals look like one family.
 */

const ROW_H = 32;
const ROW_GAP = 0;
const COL_TEMPLATE = "1fr 64px 64px";
const COL_GAP = 16;

export const GuardrailTable: React.FC<{ accent?: string }> = ({
  accent = COLORS.ACCENT,
}) => (
  <ChartCard>
    {/* Column header — small, not the giant uppercase rule it used to be */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COL_TEMPLATE,
        columnGap: COL_GAP,
        alignItems: "center",
        paddingBottom: 8,
        borderBottom: `1px solid ${COLORS.HAIRLINE}`,
      }}
    >
      <div style={axisLabelStyle}>Data flaw</div>
      <div style={{ ...axisLabelStyle, textAlign: "center" }}>Ours</div>
      <div style={{ ...axisLabelStyle, textAlign: "center" }}>sklearn</div>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {GUARDRAIL_ROWS.map((row, i) => (
        <div
          key={row.id}
          style={{
            display: "grid",
            gridTemplateColumns: COL_TEMPLATE,
            columnGap: COL_GAP,
            alignItems: "center",
            height: ROW_H,
            borderBottom:
              i < GUARDRAIL_ROWS.length - 1
                ? `1px solid ${COLORS.HAIRLINE}`
                : "none",
          }}
        >
          <div
            style={{
              fontFamily: FONTS.SANS,
              fontSize: 16,
              fontWeight: 500,
              color: COLORS.INK,
              letterSpacing: "-0.005em",
              lineHeight: 1.2,
            }}
          >
            {row.label}
          </div>
          <StatusDot caught={row.us} />
          <StatusDot caught={row.sklearn} />
        </div>
      ))}
    </div>

    {/* Summary bars — same axis style, same data-label style */}
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingTop: 16,
        marginTop: 8,
        borderTop: `1px solid ${COLORS.HAIRLINE}`,
      }}
    >
      <SummaryRow label="Ours" value={GUARDRAIL.usTotal} color={accent} />
      <SummaryRow
        label="sklearn"
        value={GUARDRAIL.sklearnTotal}
        color={COLORS.NEUTRAL_500}
      />
    </div>
  </ChartCard>
);

const StatusDot: React.FC<{ caught: boolean }> = ({ caught }) => (
  <div
    style={{
      width: 14,
      height: 14,
      borderRadius: 7,
      justifySelf: "center",
      background: caught ? COLORS.SUCCESS : COLORS.DANGER,
    }}
  />
);

const SummaryRow: React.FC<{
  label: string;
  value: number;
  color: string;
}> = ({ label, value, color }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "104px 1fr 64px",
      columnGap: COL_GAP,
      alignItems: "center",
    }}
  >
    <div
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
        lineHeight: 1,
      }}
    >
      {label}
    </div>
    <div
      style={{
        position: "relative",
        height: 8,
        background: COLORS.SURFACE,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${(value / GUARDRAIL.max) * 100}%`,
          height: "100%",
          background: color,
          borderRadius: 4,
        }}
      />
    </div>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 18,
        fontWeight: 700,
        color,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.01em",
        lineHeight: 1,
        textAlign: "right",
      }}
    >
      {value}/{GUARDRAIL.max}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Shared style atom — matches SpeedBarChart's axis label exactly.
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
