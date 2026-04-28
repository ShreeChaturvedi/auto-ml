import React from "react";
import { COLORS, FONTS, hexWithAlpha } from "../tokens";
import { ActivityLedgerChart } from "../visuals/ActivityLedgerChart";
import { FlourishUnderline } from "../visuals/FlourishUnderline";
import { SectionFrame } from "./SectionFrame";

/**
 * §1 · PROBLEM — Anaconda 2022 time-allocation data frames the motivation.
 * Headline is the strongest possible framing: 80% of ML work is not the
 * thing frameworks automate.
 *
 * Vertical rhythm (top → bottom):
 *   1. Chart block — proper chart title + source chip + activity chart
 *   2. Pull quote — serif italic, poster-scale
 *   3. Three problem facts — colored metric numerals with Lucide icons,
 *      matched to the §4 Results palette (red / blue / green) so the
 *      poster-wide color language reads as intentional.
 */

type ProblemFact = {
  value: string;
  unit: string;
  label: string;
  color: string;
  icon: React.ReactNode;
};

// Icon helpers — inlined Lucide SVG paths so we don't add a dependency.
const iconStyle = (color: string, strokeWidth = 2.25): React.SVGAttributes<SVGElement> => ({
  width: 40,
  height: 40,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

// lucide: layout-grid (5 tools → fragmented workspace)
const IconTools: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconStyle(color)} aria-hidden>
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
  </svg>
);

// lucide: hourglass (9 weeks → time to deployment)
const IconClock: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconStyle(color)} aria-hidden>
    <path d="M5 22h14" />
    <path d="M5 2h14" />
    <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
    <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
  </svg>
);

// lucide: trending-down (63% abandon → projects that never ship)
const IconAbandon: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconStyle(color)} aria-hidden>
    <path d="M16 17h6v-6" />
    <path d="m22 17-8.5-8.5-5 5L2 7" />
  </svg>
);

const TIME_FACTS: ProblemFact[] = [
  {
    value: "5",
    unit: "tools",
    label: "Jupyter, pandas, sklearn, mlflow, streamlit — stitched by hand",
    color: COLORS.MIAMI_RED,
    icon: <IconTools color={COLORS.MIAMI_RED} />,
  },
  {
    value: "9",
    unit: "weeks",
    label: "average from dataset upload to first model in production",
    color: COLORS.ACCENT,
    icon: <IconClock color={COLORS.ACCENT} />,
  },
  {
    value: "63%",
    unit: "abandon",
    label: "of ML projects never reach a deployed model",
    color: COLORS.SUCCESS,
    icon: <IconAbandon color={COLORS.SUCCESS} />,
  },
];

export const Section1Problem: React.FC = () => (
  <SectionFrame
    eyebrow="THE PROBLEM"
    number="§1"
    headline="80% of ML work isn't training."
    footnote={{
      label: "Sources",
      text:
        "Anaconda 2022 · State of Data Science (n = 3,493) · VentureBeat 2019 (project-abandonment rate)",
    }}
  >
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 0,
        gap: 32,
      }}
    >
      {/* ── Chart block — designed heading + source chip + chart ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          paddingTop: 12,
        }}
      >
        <ChartHeading
          kicker="Activity ledger · Anaconda 2022"
          title="Where data scientists spend their time"
          chip="n = 3,493"
        />
        <ActivityLedgerChart />
      </div>

      {/* ── Pull quote — Miami-red marker, poster scale ── */}
      <blockquote
        style={{
          margin: 0,
          fontFamily: FONTS.SERIF,
          fontStyle: "normal",
          fontSize: 62,
          fontWeight: 400,
          letterSpacing: "0.005em",
          lineHeight: 1.18,
          color: COLORS.INK,
          borderLeft: `6px solid ${COLORS.MIAMI_RED}`,
          paddingLeft: 32,
        }}
      >
        Data scientists spend most of their time on nearly everything except
        actually training the model.
        <br />
        <span style={{ color: COLORS.INK_MUTED }}>
          The other 80% is human. And now{" "}
          <span
            style={{
              position: "relative",
              display: "inline-block",
              color: COLORS.INK,
              fontWeight: 700,
            }}
          >
            agentic
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: "-0.08em",
                height: 16,
                pointerEvents: "none",
              }}
            >
              <FlourishUnderline
                width="100%"
                height={16}
                strokeWidth={3}
                color={COLORS.MIAMI_RED}
              />
            </span>
          </span>
          .
        </span>
      </blockquote>

      {/* ── Three problem facts — icon + colored numeral + label ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 0,
          paddingTop: 4,
          borderTop: `1px solid ${COLORS.HAIRLINE}`,
        }}
      >
        {TIME_FACTS.map((f, i) => (
          <FactCell key={f.label} fact={f} showDivider={i > 0} />
        ))}
      </div>
    </div>
  </SectionFrame>
);

// ---------------------------------------------------------------------------
// ChartHeading — proper chart-title treatment: small uppercase kicker on
// top, bold sentence-case title below, right-side chip with sample-size.
// ---------------------------------------------------------------------------

const ChartHeading: React.FC<{
  kicker: string;
  title: string;
  chip: string;
}> = ({ kicker, title, chip }) => (
  <div
    style={{
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 16,
      paddingBottom: 10,
      borderBottom: `1px solid ${COLORS.HAIRLINE_STRONG}`,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: COLORS.MIAMI_RED,
        }}
      >
        {kicker}
      </span>
      <span
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: COLORS.INK,
          lineHeight: 1.15,
        }}
      >
        {title}
      </span>
    </div>
    <span
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: COLORS.INK,
        padding: "6px 14px",
        border: `1px solid ${COLORS.INK}`,
        borderRadius: 999,
        background: COLORS.PAPER,
        whiteSpace: "nowrap",
      }}
    >
      {chip}
    </span>
  </div>
);
// ---------------------------------------------------------------------------
// FactCell — icon + colored numeral + unit + label. Borrows the §4 Results
// palette so "problem" colors echo the "results" colors and the poster reads
// as one design.
// ---------------------------------------------------------------------------

const FactCell: React.FC<{ fact: ProblemFact; showDivider: boolean }> = ({
  fact,
  showDivider,
}) => (
  <div
    style={{
      display: "flex",
      gap: 16,
      alignItems: "flex-start",
      paddingTop: 10,
      paddingRight: 16,
      paddingLeft: showDivider ? 16 : 0,
      borderLeft: showDivider ? `1px solid ${COLORS.HAIRLINE}` : "none",
    }}
  >
    <div
      style={{
        width: 52,
        height: 52,
        flexShrink: 0,
        borderRadius: 10,
        background: hexWithAlpha(fact.color, 0.1),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {fact.icon}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 52,
            fontWeight: 700,
            color: fact.color,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.03em",
            lineHeight: 0.95,
          }}
        >
          {fact.value}
        </span>
        <span
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 16,
            fontWeight: 700,
            color: COLORS.INK,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {fact.unit}
        </span>
      </div>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 15,
          fontWeight: 500,
          color: COLORS.INK_MUTED,
          lineHeight: 1.35,
        }}
      >
        {fact.label}
      </div>
    </div>
  </div>
);
