import React from "react";
import { COLORS, FONTS } from "../theme";
import { GUARDRAIL, GUARDRAIL_ROWS } from "../content";
import { ChartCard } from "./ChartCard";

/**
 * 5-row guardrail table + 2 summary bars, ported from
 * `poster/src/visuals/GuardrailTable.tsx`. Sizes trimmed for booklet scale.
 */

const ROW_H = 22;
const COL_TEMPLATE = "1fr 48px 48px";
const COL_GAP = 12;

export const GuardrailTable: React.FC<{ accent?: string }> = ({
  accent = COLORS.ACCENT,
}) => (
  <ChartCard>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COL_TEMPLATE,
        columnGap: COL_GAP,
        alignItems: "center",
        paddingBottom: 6,
        borderBottom: `0.5pt solid ${COLORS.HAIRLINE}`,
      }}
    >
      <div style={axisLabelStyle}>Data flaw</div>
      <div style={{ ...axisLabelStyle, textAlign: "center" }}>Ours</div>
      <div style={{ ...axisLabelStyle, textAlign: "center" }}>sklearn</div>
    </div>

    <div style={{ display: "flex", flexDirection: "column" }}>
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
                ? `0.5pt solid ${COLORS.HAIRLINE}`
                : "none",
          }}
        >
          <div
            style={{
              fontFamily: FONTS.SANS,
              fontSize: 10,
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

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        paddingTop: 12,
        marginTop: 6,
        borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
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
      width: 9,
      height: 9,
      borderRadius: 4.5,
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
      gridTemplateColumns: "72px 1fr 48px",
      columnGap: COL_GAP,
      alignItems: "center",
    }}
  >
    <div
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 9,
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
        height: 6,
        background: COLORS.SURFACE,
        borderRadius: 3,
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
          borderRadius: 3,
        }}
      />
    </div>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 12,
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

const axisLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.SANS,
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: COLORS.INK_MUTED,
  lineHeight: 1,
};
