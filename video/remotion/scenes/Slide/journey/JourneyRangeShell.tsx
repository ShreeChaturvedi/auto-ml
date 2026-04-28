import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ARCH_PALETTE } from "../../../../config/arch-layout";
import {
  RANGE_CUMULATIVE,
  RANGE_HERO_LINES,
  RANGE_MILESTONES,
  RANGE_STATS,
} from "../../../../config/journey-content";
import {
  JOURNEY_LAYOUT,
  RANGE_ACCENT,
  type JourneyRange,
} from "../../../../config/journey-layout";
import { EASE_OUT } from "../../../../config/easing";
import { MONOSPACE_FONT, TITLE_FONT } from "../../../../config/fonts";
import { COLORS, type Theme } from "../../../../config/themes";
import { useFadeIn } from "../../../helpers/useFadeIn";
import { MetricCard } from "../../../primitives/MetricCard";
import { MotionLine } from "../../../primitives/MotionLine";
import { SlideShell } from "../../../primitives/SlideShell";
import type { PhaseInfo } from "../../../primitives/useTimeline";
import { useTimeline } from "../../../primitives/useTimeline";
import { JourneyHeader } from "./JourneyHeader";

/**
 * Shared timeline + chrome for the 3 range slides (foundation, agentic,
 * production). PHASES sum = 480 f (8 s) per slide.
 */
const PHASES = [30, 60, 40, 90, 90, 80, 90] as const;
type SevenPhases = [
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
];

type RangeKey = "foundation" | "agentic" | "production";

const PREVIOUS_FOR: Record<RangeKey, JourneyRange> = {
  foundation: "pulse",
  agentic: "foundation",
  production: "agentic",
};

export type JourneyRangeShellProps = {
  theme: Theme;
  range: RangeKey;
  /** Hero-moment content rendered in P6 (frames 390-480). */
  heroMoment: React.ReactNode;
};

export const JourneyRangeShell: React.FC<JourneyRangeShellProps> = ({
  theme,
  range,
  heroMoment,
}) => {
  const [, pHero, pDivider, pCards, pCounts, pMilestones, pHeroMoment] =
    useTimeline([...PHASES]) as SevenPhases;

  const frame = useCurrentFrame();
  const c = COLORS[theme];
  const stats = RANGE_STATS[range];
  const milestones = RANGE_MILESTONES[range];
  const accent = RANGE_ACCENT[range];
  const cumulative = RANGE_CUMULATIVE[range];
  const previous: { commits: number; issues: number; mrs: number } =
    range === "foundation"
      ? { commits: 0, issues: 0, mrs: 0 }
      : range === "agentic"
        ? RANGE_CUMULATIVE.foundation
        : RANGE_CUMULATIVE.agentic;

  const heroFade = useFadeIn({
    delay: pHero.start,
    translateY: 12,
    damping: 200,
  });

  const { metrics, milestones: mLayout, heroLine, heroMoment: heroMLayout } =
    JOURNEY_LAYOUT;

  const cardDelay = pCards.start;

  return (
    <SlideShell theme={theme} eyebrow="THE JOURNEY" divider footer>
      <div style={{ position: "absolute", inset: 0 }}>
        {/* Shared morph-capable sprint-band header. */}
        <JourneyHeader activeRange={range} previousRange={PREVIOUS_FOR[range]} />

        {/* Hero line — Plus Jakarta Sans bold (Instrument Serif only loads
         *  weight 400 so it reads anemic at this size). */}
        <div
          style={{
            position: "absolute",
            left: heroLine.x,
            top: heroLine.y,
            width: heroLine.w,
            ...TITLE_FONT,
            fontWeight: 600,
            fontSize: heroLine.fontSize,
            lineHeight: heroLine.lineHeight,
            letterSpacing: "-0.015em",
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: heroFade.opacity,
            transform: heroFade.transform,
          }}
        >
          {RANGE_HERO_LINES[range]}
        </div>

        {/* Hairline divider under the hero line. */}
        <div
          style={{
            position: "absolute",
            left: heroLine.x,
            top: heroLine.y + 88,
            width: heroLine.w,
            height: 2,
          }}
        >
          <MotionLine
            x1={0}
            y1={0}
            x2={heroLine.w}
            y2={0}
            delay={pDivider.start}
            durationInFrames={30}
            color={ARCH_PALETTE.hairline}
            strokeWidth={1}
            svgWidth={heroLine.w}
            svgHeight={2}
          />
        </div>

        {/* 3 MetricCards — commits · issues · merge requests. */}
        <MetricCard
          theme={theme}
          x={metrics.xs[0]}
          y={metrics.y}
          w={metrics.cardW}
          h={metrics.cardH}
          eyebrow="COMMITS"
          value={cumulative.commits}
          from={previous.commits}
          format={(v) => Math.round(v).toLocaleString()}
          enterFrame={cardDelay}
          numberOffsetFrames={pCounts.start - (cardDelay + 24)}
          highlight
        />
        <MetricCard
          theme={theme}
          x={metrics.xs[1]}
          y={metrics.y}
          w={metrics.cardW}
          h={metrics.cardH}
          eyebrow="ISSUES"
          value={cumulative.issues}
          from={previous.issues}
          format={(v) => Math.round(v).toLocaleString()}
          enterFrame={cardDelay + 15}
          numberOffsetFrames={pCounts.start - (cardDelay + 15 + 24)}
        />
        <MetricCard
          theme={theme}
          x={metrics.xs[2]}
          y={metrics.y}
          w={metrics.cardW}
          h={metrics.cardH}
          eyebrow="MERGE REQUESTS"
          value={cumulative.mrs}
          from={previous.mrs}
          format={(v) => Math.round(v).toLocaleString()}
          enterFrame={cardDelay + 30}
          numberOffsetFrames={pCounts.start - (cardDelay + 30 + 24)}
        />

        {/* Per-card +Δ deltas (agentic + production show explicit change). */}
        {range !== "foundation" ? (
          <>
            {(
              [
                { label: stats.commits, x: metrics.xs[0] },
                { label: stats.issues, x: metrics.xs[1] },
                { label: stats.mrs, x: metrics.xs[2] },
              ] as const
            ).map((d, i) => {
              const deltaAppear = pCounts.start + 10 + i * 4;
              const deltaOpacity = interpolate(
                frame,
                [deltaAppear, deltaAppear + 24],
                [0, 1],
                {
                  easing: EASE_OUT,
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              );
              return (
                <div
                  key={`delta-${i}`}
                  style={{
                    position: "absolute",
                    left: d.x + 24,
                    top: metrics.y + metrics.cardH - 44,
                    ...MONOSPACE_FONT,
                    fontSize: 14,
                    fontWeight: 700,
                    color: accent,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    opacity: deltaOpacity,
                  }}
                >
                  +{d.label.toLocaleString()} this range
                </div>
              );
            })}
          </>
        ) : null}

        {/* Right-rail milestones list. */}
        <div
          style={{
            position: "absolute",
            left: mLayout.x,
            top: mLayout.y,
            width: mLayout.w,
          }}
        >
          {milestones.map((m, i) => {
            const rowDelay = pMilestones.start + i * 20;
            const rowOpacity = interpolate(
              frame,
              [rowDelay, rowDelay + 30],
              [0, 1],
              {
                easing: EASE_OUT,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            );
            const rowTy = interpolate(
              frame,
              [rowDelay, rowDelay + 30],
              [18, 0],
              {
                easing: EASE_OUT,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            );
            return (
              <div
                key={`${m.when}-${i}`}
                style={{
                  position: "absolute",
                  left: 0,
                  top: i * mLayout.rowH,
                  opacity: rowOpacity,
                  transform: `translateY(${rowTy}px)`,
                }}
              >
                <div
                  style={{
                    ...MONOSPACE_FONT,
                    fontSize: 13,
                    color: accent,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {m.when}
                </div>
                <div
                  style={{
                    ...TITLE_FONT,
                    fontWeight: 600,
                    fontSize: 20,
                    color: c.WORD_COLOR_ON_BG_APPEARED,
                    marginTop: 6,
                    lineHeight: 1.3,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hero-moment slot — P6. Each range slide supplies its own body. */}
        <div
          style={{
            position: "absolute",
            left: heroMLayout.x,
            top: heroMLayout.y,
            width: heroMLayout.w,
            height: heroMLayout.h,
          }}
        >
          <HeroMomentSlot startFrame={pHeroMoment.start}>{heroMoment}</HeroMomentSlot>
        </div>

        {/* Per-range date-range strip (bottom-left). */}
        <div
          style={{
            position: "absolute",
            left: 120,
            top: JOURNEY_LAYOUT.methodStripY,
            ...MONOSPACE_FONT,
            fontSize: 14,
            letterSpacing: "0.12em",
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: heroFade.opacity,
          }}
        >
          {stats.dateRange}
        </div>
      </div>
    </SlideShell>
  );
};

const HeroMomentSlot: React.FC<{
  startFrame: number;
  children: React.ReactNode;
}> = ({ startFrame, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + 20],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div style={{ opacity, position: "absolute", inset: 0 }}>{children}</div>
  );
};
