import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ARCH_PALETTE } from "../../../config/arch-layout";
import {
  JOURNEY_HERO,
  JOURNEY_METHODOLOGY,
  JOURNEY_TOTALS,
  MONTH_TICKS,
  PEAK_WEEK,
  TOP_CONTRIBUTORS,
  WEEKLY_BUCKETS,
} from "../../../config/journey-content";
import {
  JOURNEY_LAYOUT,
  JOURNEY_PALETTE,
} from "../../../config/journey-layout";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, TITLE_FONT } from "../../../config/fonts";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { CounterStrip } from "../../primitives/CounterStrip";
import { FlourishUnderline } from "../../primitives/FlourishUnderline";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import { CommitBarRow } from "./journey/CommitBarRow";
import { JourneyHeader } from "./journey/JourneyHeader";
import type { SlideBodyProps } from "./index";

// PHASES sum = 600 frames (10 s). See plan — 9 layered phases.
const PHASES = [30, 30, 50, 60, 90, 40, 40, 60, 200] as const;
type NinePhases = [
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
];

/**
 * Slide 1 — Project Pulse. Section headliner: commit-activity chart,
 * 3 CounterStrip cells (commits · issues · MRs), month ticks, sprint bands,
 * rising weekly bars, peak-week callout at week-17's 420 commits.
 */
export const JourneyPulseSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const [
    pShell,
    pTitle,
    pCounters,
    pAxis,
    pBands,
    pBars,
    pPeak,
    pFooter,
    pHold,
  ] = useTimeline([...PHASES]) as NinePhases;

  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const shellFade = useFadeIn({ delay: pShell.start, durationInFrames: 30 });
  const title = useFadeIn({
    delay: pTitle.start,
    translateY: 12,
    damping: 200,
  });
  const methodFade = useFadeIn({
    delay: pHold.start + 20,
    translateY: 4,
    damping: 200,
  });
  const footerFade = useFadeIn({
    delay: pFooter.start,
    translateY: 4,
    damping: 200,
  });

  const { chart } = JOURNEY_LAYOUT;
  const barStride = chart.w / WEEKLY_BUCKETS.length;
  const barW = Math.max(6, barStride - chart.barGap);

  const bandsActive = frame >= pBands.start;

  return (
    <SlideShell theme={theme} eyebrow={JOURNEY_HERO.eyebrow} divider footer>
      <div style={{ position: "absolute", inset: 0, opacity: shellFade.opacity }}>
        {/* Shared 3-cell sprint-band header (morph anchor across slides 1-4). */}
        <JourneyHeader activeRange="pulse" previousRange="pulse" />

        {/* Hero title — sits above the counter row, narrowed so it doesn't
         *  collide with the 3 counter cards that land to its right. */}
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 200,
            width: 820,
            ...TITLE_FONT,
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: title.opacity,
            transform: title.transform,
          }}
        >
          Eleven months.
          <br />
          One working{" "}
          <span
            style={{
              position: "relative",
              display: "inline-block",
              lineHeight: 1.1,
            }}
          >
            {JOURNEY_HERO.flourishTarget}
            <FlourishUnderline
              delay={pTitle.start + 20}
              drawOut={false}
              color={ARCH_PALETTE.miamiRed}
              style={{
                position: "absolute",
                top: "calc(100% - 4px)",
                left: 0,
                width: "100%",
                height: 16,
              }}
            />
          </span>
        </div>

        {/* 3-cell CounterStrip: 1,989 / 324 / 115. Lives to the right of the
         *  title, anchored so (x=1000) + (3*240 + 2*24) = 1768 < 1824. */}
        <CounterStrip
          cells={[
            { label: "commits", to: JOURNEY_TOTALS.commits },
            { label: "issues", to: JOURNEY_TOTALS.issues },
            { label: "merge requests", to: JOURNEY_TOTALS.mrs },
          ]}
          x={1000}
          y={220}
          cardW={240}
          cardH={120}
          gap={24}
          startFrame={pCounters.start}
          staggerFrames={15}
          countUpOffsetFrames={48}
          countUpDurationFrames={36}
        />

        {/* Sprint bands under the chart — 3 range-tinted rects. */}
        {bandsActive ? (
          <>
            {([
              { accent: JOURNEY_PALETTE.foundationAccent, startWeek: 0, endWeek: 8 },
              { accent: JOURNEY_PALETTE.agenticAccent, startWeek: 8, endWeek: 12 },
              { accent: JOURNEY_PALETTE.productionAccent, startWeek: 12, endWeek: WEEKLY_BUCKETS.length },
            ] as const).map((band, i) => {
              const bandX = chart.x + band.startWeek * barStride;
              const bandW = (band.endWeek - band.startWeek) * barStride;
              const enterAt = pBands.start + i * 30;
              const bandProgress = interpolate(
                frame,
                [enterAt, enterAt + 30],
                [0, 1],
                {
                  easing: EASE_OUT,
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              );
              return (
                <div
                  key={`band-${i}`}
                  style={{
                    position: "absolute",
                    left: bandX,
                    top: chart.y - 10,
                    width: bandW * bandProgress,
                    height: chart.h + 30,
                    background: band.accent,
                    opacity: 0.08,
                    borderRadius: 4,
                  }}
                />
              );
            })}
          </>
        ) : null}

        {/* Hairline axis baseline. */}
        <div
          style={{
            position: "absolute",
            left: chart.x,
            top: JOURNEY_LAYOUT.axis.y,
            width: chart.w,
          }}
        >
          <MotionLine
            x1={0}
            y1={0}
            x2={chart.w}
            y2={0}
            delay={pAxis.start}
            durationInFrames={48}
            color={ARCH_PALETTE.hairline}
            strokeWidth={1}
            svgWidth={chart.w}
            svgHeight={2}
          />
        </div>

        {/* Month tick labels. */}
        {MONTH_TICKS.map((tick, i) => {
          const tickOpacity = interpolate(
            frame,
            [pAxis.start + 20 + i * 8, pAxis.start + 40 + i * 8],
            [0, 1],
            { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const xAt = chart.x + tick.atWeek * barStride;
          return (
            <div
              key={tick.label}
              style={{
                position: "absolute",
                left: xAt,
                top: JOURNEY_LAYOUT.axis.monthLabelY,
                ...MONOSPACE_FONT,
                fontSize: 13,
                color: ARCH_PALETTE.mute,
                opacity: tickOpacity,
              }}
            >
              {tick.label}
            </div>
          );
        })}

        {/* Weekly commit bars. */}
        <CommitBarRow
          risesAt={pBars.start}
          peakHaloAt={pPeak.start + 20}
          peakBreatheAt={pHold.start + 20}
        />

        {/* Peak-week callout: pill + leader line. */}
        <PeakCallout
          startFrame={pPeak.start}
          peakX={chart.x + PEAK_WEEK.weekIndex * barStride + barW / 2}
        />

        {/* Methodology strip (bottom-left). */}
        <div
          style={{
            position: "absolute",
            left: 120,
            top: JOURNEY_LAYOUT.methodStripY,
            ...MONOSPACE_FONT,
            fontSize: 14,
            letterSpacing: "0.14em",
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: methodFade.opacity,
            transform: methodFade.transform,
          }}
        >
          {JOURNEY_METHODOLOGY}
        </div>

        {/* Contributor footer (bottom-right). */}
        <div
          style={{
            position: "absolute",
            right: 120,
            top: JOURNEY_LAYOUT.contributorStripY,
            ...MONOSPACE_FONT,
            fontSize: 14,
            letterSpacing: "0.08em",
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: footerFade.opacity,
            transform: footerFade.transform,
          }}
        >
          {JOURNEY_TOTALS.contributors} contributors · {TOP_CONTRIBUTORS[0]!.name}{" "}
          {TOP_CONTRIBUTORS[0]!.commits.toLocaleString()} · {TOP_CONTRIBUTORS[1]!.name}{" "}
          {TOP_CONTRIBUTORS[1]!.commits.toLocaleString()}
        </div>
      </div>
    </SlideShell>
  );
};

const PeakCallout: React.FC<{ startFrame: number; peakX: number }> = ({
  startFrame,
  peakX,
}) => {
  const frame = useCurrentFrame();
  const pillOpacity = interpolate(
    frame,
    [startFrame, startFrame + 24],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const pillY = interpolate(
    frame,
    [startFrame, startFrame + 24],
    [8, 0],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: peakX - 180,
          top: JOURNEY_LAYOUT.peakPill.y,
          opacity: pillOpacity,
          transform: `translateY(${pillY}px)`,
          padding: `${JOURNEY_LAYOUT.peakPill.padY}px ${JOURNEY_LAYOUT.peakPill.padX}px`,
          background: JOURNEY_PALETTE.productionAccent,
          color: "#0A0A0A",
          borderRadius: 999,
          ...MONOSPACE_FONT,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(245,158,11,0.30)",
        }}
      >
        {PEAK_WEEK.label}
      </div>
      <div
        style={{
          position: "absolute",
          left: peakX,
          top: JOURNEY_LAYOUT.peakPill.y + 32,
        }}
      >
        <MotionLine
          x1={0}
          y1={0}
          x2={0}
          y2={50}
          delay={startFrame + 10}
          durationInFrames={24}
          color={JOURNEY_PALETTE.productionAccent}
          strokeWidth={2}
          svgWidth={4}
          svgHeight={60}
        />
      </div>
    </>
  );
};
