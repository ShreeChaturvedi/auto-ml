import React from "react";
import { COLORS, FONTS } from "../tokens";
import { ChartCard } from "../visuals/ChartCard";
import { SpeedBarChart } from "../visuals/SpeedBarChart";
import { GuardrailTable } from "../visuals/GuardrailTable";
import { PercentileGauge } from "../visuals/PercentileGauge";
import { SectionFrame } from "./SectionFrame";
import { HERO, GUARDRAIL, QUALITY, QUALITY_CELLS } from "../content";

/**
 * §4 · RESULTS — three evidence tiers, each rendered through the same
 * "tier shell": HERO column on the left + ChartCard on the right. All three
 * visuals share chrome (paper-elevated bg, hairline border, 10px radius,
 * 16px padding) and the same axis / data-label typography, so the section
 * reads as a single designed system.
 *
 *   Speed       7×       · 5 datasets vs manual Jupyter        (INK)
 *   Guardrails  16/20    · 5 representative flaws + summary    (ACCENT)
 *   Quality     TOP 15%  · percentile gauge + 5 dataset cells  (SUCCESS)
 */

const TIER_GAP = 24;
const HERO_COL = 320;

export const Section4Results: React.FC = () => (
  <SectionFrame
    eyebrow="THE RESULTS"
    number="§4"
    headline="Measured on the public leaderboard."
    footnote={{
      label: "Method",
      text: "5 Kaggle datasets · 25 runs · 80/20 stratified · seed 42 · GPT-4o-mini · T = 0.0",
    }}
  >
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: TIER_GAP,
        minHeight: 0,
      }}
    >
      <Tier
        label="Speed"
        heroValue={HERO.speedX}
        heroCaption="faster than manual Jupyter"
        heroMethod={`${HERO.speedMinutesSaved} min saved per session · dataset → trained model`}
        heroColor={COLORS.MIAMI_RED}
      >
        <SpeedBarChart accent={COLORS.MIAMI_RED} />
      </Tier>

      <Divider />

      <Tier
        label="Guardrails"
        heroValue={`${GUARDRAIL.usTotal}/${GUARDRAIL.max}`}
        heroCaption={`vs sklearn ${GUARDRAIL.sklearnTotal}/${GUARDRAIL.max}`}
        heroMethod="data-quality flaws caught before training"
        heroColor={COLORS.ACCENT}
      >
        <GuardrailTable accent={COLORS.ACCENT} />
      </Tier>

      <Divider />

      <Tier
        label="Quality"
        heroValue="TOP 15%"
        heroCaption="on every Kaggle benchmark"
        heroMethod="Titanic 92nd percentile · no dataset-specific tuning"
        heroColor={COLORS.SUCCESS}
      >
        <QualityVisual />
      </Tier>
    </div>
  </SectionFrame>
);

// ---------------------------------------------------------------------------
// Shared chart-card chrome. Every visual sits inside one of these so the
// three tiers read as one family.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tier — every results row has the same shape:
//   [HERO COLUMN]   [CHART CARD]
//   tier label
//   88pt number
//   1-line caption
//   1-line method
// ---------------------------------------------------------------------------

const Tier: React.FC<{
  label: string;
  heroValue: string;
  heroCaption: string;
  heroMethod: string;
  heroColor: string;
  children: React.ReactNode;
}> = ({ label, heroValue, heroCaption, heroMethod, heroColor, children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `${HERO_COL}px 1fr`,
      columnGap: 32,
      alignItems: "center",
      minHeight: 0,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: COLORS.INK_MUTED,
          lineHeight: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 88,
          fontWeight: 700,
          color: heroColor,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.03em",
          lineHeight: 0.95,
        }}
      >
        {heroValue}
      </div>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 18,
          fontWeight: 600,
          color: COLORS.INK,
          letterSpacing: "-0.005em",
          lineHeight: 1.2,
        }}
      >
        {heroCaption}
      </div>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 15,
          fontWeight: 500,
          color: COLORS.INK_MUTED,
          lineHeight: 1.3,
        }}
      >
        {heroMethod}
      </div>
    </div>
    <div style={{ minWidth: 0 }}>{children}</div>
  </div>
);

const Divider: React.FC = () => (
  <div
    style={{
      height: 1,
      width: "100%",
      background: COLORS.HAIRLINE,
    }}
  />
);

// ---------------------------------------------------------------------------
// Quality — gauge in a chart card, then 5 mini chart cards (same chrome).
// ---------------------------------------------------------------------------

const QualityVisual: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <ChartCard>
      <PercentileGauge
        rank={QUALITY.heroRank}
        baselineRank={QUALITY.baselineRank}
        accent={COLORS.SUCCESS}
      />
    </ChartCard>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 8,
      }}
    >
      {QUALITY_CELLS.map((cell) => (
        <ChartCard key={cell.dataset} padding={16}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontFamily: FONTS.SANS,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: COLORS.INK_MUTED,
                lineHeight: 1,
              }}
            >
              {cell.dataset}
            </div>
            <div
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 24,
                fontWeight: 700,
                color: COLORS.INK,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
                lineHeight: 1,
              }}
            >
              {cell.value}
            </div>
            <div
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.SUCCESS,
                letterSpacing: "0.04em",
                lineHeight: 1,
              }}
            >
              {cell.tier}
            </div>
          </div>
        </ChartCard>
      ))}
    </div>
  </div>
);
