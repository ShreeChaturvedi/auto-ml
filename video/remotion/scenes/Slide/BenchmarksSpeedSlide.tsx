import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ARCH_PALETTE } from "../../../config/arch-layout";
import {
  METHOD_FOOTNOTES,
  SPEED_DATA,
  SPEED_HERO_X,
  SPEED_TOTAL_MIN_SAVED,
} from "../../../config/benchmarks-content";
import {
  BENCHMARKS_PALETTE,
  METHOD_STRIP,
  SEQ_COUNTER,
  SPEED,
} from "../../../config/benchmarks-layout";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import { COLORS } from "../../../config/themes";
import type { Theme } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { CountUpNumber } from "../../primitives/CountUpNumber";
import { MotionLine } from "../../primitives/MotionLine";
import { ScaleInNumber } from "../../primitives/ScaleInNumber";
import { SlideShell } from "../../primitives/SlideShell";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 9-phase timeline (sum = 1080 = 18s @ 60fps).
 *  0 fade · 1 title · 2 axis · 3 bars (5×120f) · 4 hero · 5 saved · 6 legend · 7 method · 8 hold. */
const PHASES = [30, 60, 30, 600, 60, 60, 30, 30, 180] as const;

type NinePhases = [
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
];

// ---- Bar-race geometry ----------------------------------------------------
const ROW_STRIDE = 120;
const BAR_STAGGER = 8;
const BAR_DRAW_FRAMES = 36;
const BAR_VALUE_DELAY = 6;
const BAR_VALUE_DURATION = 30;
/** Ours renders thickest so it reads first at a glance.
 *  Offsets inside the 116px row: 16 top pad + [32] + 8 + [16] + 8 + [16] = 96. */
const BAR_US_HEIGHT = 32;
const BAR_COMPETITOR_HEIGHT = 16;
const BAR_US_TOP = 16;
const BAR_JUPYTER_TOP = BAR_US_TOP + BAR_US_HEIGHT + 8;
const BAR_AUTOGLUON_TOP = BAR_JUPYTER_TOP + BAR_COMPETITOR_HEIGHT + 8;

// ---- Right-rail geometry --------------------------------------------------
const HERO_RAIL = { left: 1240, top: 340, width: 560 } as const;
const HERO_NUMERAL_TOP = 40;   // canvas y = 380
const HERO_FASTER_TOP = 260;
const HERO_HAIRLINE_TOP = 320;
const HERO_SAVED_TOP = 340;
const HERO_HAIRLINE_WIDTH = 200;

// ---- Legend row -----------------------------------------------------------
const LEGEND_POS = { left: 120, top: 940, fontSize: 13 } as const;
const LEGEND_SWATCH = 12;

type BarSpec = {
  kind: "us" | "jupyter" | "autogluon";
  value: number;
  color: string;
  height: number;
  top: number;
  isHero: boolean;
};

type BarRaceRowProps = {
  theme: Theme;
  x: number; y: number; w: number; rowH: number;
  labelGutterW: number; valueGutterW: number; scaleMax: number;
  dataset: string; subLabel: string;
  us: number; jupyter: number; autogluon: number;
  /** Absolute frame this row begins animating. */
  startFrame: number;
};

/**
 * Slide-local bar-race row — three bars with differentiated heights so our
 * number reads first. Mirrors `SkillStackVisual` in ProblemTrioSlide. */
const BarRaceRow: React.FC<BarRaceRowProps> = ({
  theme, x, y, w, rowH, labelGutterW, valueGutterW, scaleMax,
  dataset, subLabel, us, jupyter, autogluon, startFrame,
}) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];
  const trackW = w - labelGutterW - valueGutterW;

  const bars: readonly BarSpec[] = [
    { kind: "us", value: us, color: c.WORD_COLOR_ON_BG_APPEARED,
      height: BAR_US_HEIGHT, top: BAR_US_TOP, isHero: true },
    { kind: "jupyter", value: jupyter, color: BENCHMARKS_PALETTE.competitorGrey,
      height: BAR_COMPETITOR_HEIGHT, top: BAR_JUPYTER_TOP, isHero: false },
    { kind: "autogluon", value: autogluon, color: BENCHMARKS_PALETTE.competitorAmber,
      height: BAR_COMPETITOR_HEIGHT, top: BAR_AUTOGLUON_TOP, isHero: false },
  ];

  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: rowH }}>
      {/* Label gutter — right-flush so the track edges align across rows. */}
      <div
        style={{
          position: "absolute",
          left: 0, top: 0,
          width: labelGutterW - 16,
          height: rowH,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-end",
          textAlign: "right",
          paddingRight: 4,
        }}
      >
        <div
          style={{
            ...TITLE_FONT,
            fontSize: 20, fontWeight: 600,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            letterSpacing: "-0.01em", lineHeight: 1.2,
          }}
        >
          {dataset}
        </div>
        <div
          style={{
            ...MONOSPACE_FONT,
            fontSize: 12,
            color: c.WORD_COLOR_ON_BG_GREYED,
            letterSpacing: "0.04em", marginTop: 4, lineHeight: 1.2,
          }}
        >
          {subLabel}
        </div>
      </div>

      {bars.map((bar, i) => {
        const barStart = startFrame + i * BAR_STAGGER;
        const targetW = (bar.value / scaleMax) * trackW;
        const width = interpolate(
          frame,
          [barStart, barStart + BAR_DRAW_FRAMES],
          [0, targetW],
          { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const radius = bar.height / 2;
        const valueDelay = barStart + BAR_DRAW_FRAMES + BAR_VALUE_DELAY;
        const valueFontSize = bar.isHero ? 20 : 14;
        const valueColor = bar.isHero
          ? c.WORD_COLOR_ON_BG_APPEARED
          : c.WORD_COLOR_ON_BG_GREYED;
        // Opacity gate: hide the "0.0m" count-up start-state before firing.
        const valueOpacity = interpolate(
          frame,
          [valueDelay - 4, valueDelay + 4],
          [0, 1],
          { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const trackBase = {
          position: "absolute" as const,
          left: labelGutterW,
          top: bar.top,
          height: bar.height,
          borderRadius: radius,
        };

        return (
          <React.Fragment key={bar.kind}>
            <div style={{ ...trackBase, width: trackW, background: c.BORDER_COLOR }} />
            <div style={{ ...trackBase, width, background: bar.color }} />
            <div
              style={{
                position: "absolute",
                left: labelGutterW + trackW + 10,
                top: bar.top + (bar.height - valueFontSize) / 2,
                width: valueGutterW - 10,
                ...MONOSPACE_FONT,
                fontSize: valueFontSize,
                fontWeight: bar.isHero ? 700 : 500,
                color: valueColor,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                opacity: valueOpacity,
              }}
            >
              <CountUpNumber
                to={bar.value}
                format={(v) => `${v.toFixed(1)}m`}
                delay={valueDelay}
                durationInFrames={BAR_VALUE_DURATION}
              />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

type LegendEntry = { swatch: string; labelColor: string; label: string };

/**
 * BenchmarksSpeedSlide (02 / 04) — "From CSV to evaluation, in minutes."
 *
 * Left: 5 bar-race rows stacking ours (32px ink) above jupyter (16px grey)
 * above autogluon (16px amber) — hierarchy reads at a glance. Right rail:
 * hero "7×" rendered in INK (not accentBlue, which would clash with any
 * blue downstream and would camouflage against 'our' bars) plus a hairline
 * and a "116 minutes reclaimed per session" count-up. Title holds at full
 * opacity — the previous dim read as the slide losing interest in itself.
 */
export const BenchmarksSpeedSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const phases = useTimeline([...PHASES]) as NinePhases;
  const [pFade, pTitle, , pBars, pHero, pSaved, pLegend, pMethod] = phases;
  const c = COLORS[theme];

  const fade = useFadeIn({ delay: pFade.start, durationInFrames: 30 });
  const titleFade = useFadeIn({ delay: pTitle.start, translateY: 12, damping: 200 });
  const faster = useFadeIn({ delay: pHero.start + 18, damping: 200 });
  const legendFade = useFadeIn({ delay: pLegend.start, damping: 200 });
  const methodFade = useFadeIn({ delay: pMethod.start, translateY: 4, damping: 200 });
  // Gate the saved-counter so "0 minutes" (pre-count-up state) is hidden.
  const savedGate = useFadeIn({ delay: pSaved.start - 4, damping: 200 });

  const legendEntries: readonly LegendEntry[] = [
    { swatch: c.WORD_COLOR_ON_BG_APPEARED, labelColor: c.WORD_COLOR_ON_BG_APPEARED, label: "ours" },
    { swatch: BENCHMARKS_PALETTE.competitorGrey, labelColor: c.WORD_COLOR_ON_BG_GREYED, label: "manual Jupyter" },
    { swatch: BENCHMARKS_PALETTE.competitorAmber, labelColor: c.WORD_COLOR_ON_BG_GREYED, label: "AutoGluon" },
  ];

  return (
    <SlideShell theme={theme} eyebrow="SPEED" divider footer>
      <div style={{ position: "absolute", inset: 0, opacity: fade.opacity }}>
        {/* Slide title — full opacity throughout. */}
        <div
          style={{
            position: "absolute",
            left: SPEED.title.left, top: SPEED.title.top, width: SPEED.title.width,
            ...TITLE_FONT,
            fontSize: 48, fontWeight: 700,
            letterSpacing: "-0.025em", lineHeight: 1.1,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: titleFade.opacity, transform: titleFade.transform,
          }}
        >
          From CSV to evaluation, in minutes.
        </div>

        {/* Bar-race rows — one per dataset. */}
        {SPEED_DATA.map((row, i) => (
          <BarRaceRow
            key={row.dataset}
            theme={theme}
            x={SPEED.bars.x}
            y={SPEED.bars.y + i * (SPEED.bars.rowH + SPEED.bars.rowGap)}
            w={SPEED.bars.w}
            rowH={SPEED.bars.rowH}
            labelGutterW={SPEED.bars.labelGutterW}
            valueGutterW={SPEED.bars.valueGutterW}
            scaleMax={SPEED.bars.scaleMax}
            dataset={row.dataset}
            subLabel={row.subLabel}
            us={row.us}
            jupyter={row.jupyter}
            autogluon={row.autogluon}
            startFrame={pBars.start + i * ROW_STRIDE}
          />
        ))}

        {/* Right rail — hero numeral, FASTER caption, hairline, saved-counter. */}
        <div style={{ position: "absolute", left: HERO_RAIL.left, top: HERO_RAIL.top, width: HERO_RAIL.width }}>
          <div
            style={{
              position: "absolute", top: HERO_NUMERAL_TOP, left: 0,
              ...TITLE_FONT,
              fontSize: 200, fontWeight: 600,
              color: c.WORD_COLOR_ON_BG_APPEARED,
              letterSpacing: "-0.04em", lineHeight: 0.95,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <ScaleInNumber value={SPEED_HERO_X} delay={pHero.start} />
          </div>
          <div
            style={{
              position: "absolute", top: HERO_FASTER_TOP, left: 0, marginTop: 8,
              ...REGULAR_FONT,
              fontSize: 18, fontWeight: 600,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: c.WORD_COLOR_ON_BG_GREYED,
              opacity: faster.opacity,
            }}
          >
            faster
          </div>
          <div style={{ position: "absolute", top: HERO_HAIRLINE_TOP, left: 0 }}>
            <MotionLine
              x1={0} y1={0}
              x2={HERO_HAIRLINE_WIDTH} y2={0}
              delay={pHero.start}
              durationInFrames={36}
              strokeWidth={1}
              color={c.BORDER_COLOR}
              svgWidth={HERO_HAIRLINE_WIDTH}
              svgHeight={2}
            />
          </div>
          <div
            style={{
              position: "absolute", top: HERO_SAVED_TOP, left: 0,
              ...REGULAR_FONT,
              fontSize: 24,
              color: c.WORD_COLOR_ON_BG_APPEARED,
              lineHeight: 1.3,
              maxWidth: 480,
              opacity: savedGate.opacity,
            }}
          >
            <CountUpNumber
              to={SPEED_TOTAL_MIN_SAVED}
              format={(v) => `${Math.round(v)} minutes`}
              delay={pSaved.start}
              durationInFrames={48}
            />
            <span
              style={{
                display: "block",
                color: c.WORD_COLOR_ON_BG_GREYED,
                fontSize: 16, marginTop: 6,
              }}
            >
              reclaimed per session, vs Jupyter
            </span>
          </div>
        </div>

        {/* Top-right sequence counter — mono, mute. */}
        <div
          style={{
            position: "absolute",
            right: SEQ_COUNTER.right, top: SEQ_COUNTER.top,
            ...MONOSPACE_FONT,
            fontSize: SEQ_COUNTER.fontSize,
            color: ARCH_PALETTE.mute,
          }}
        >
          02 / 04
        </div>

        {/* Legend — 12×12 swatch + label, keyed to the three bar colours. */}
        <div
          style={{
            position: "absolute",
            left: LEGEND_POS.left, top: LEGEND_POS.top,
            display: "flex", alignItems: "center", gap: 24,
            ...REGULAR_FONT,
            fontSize: LEGEND_POS.fontSize,
            letterSpacing: "0.02em",
            opacity: legendFade.opacity,
          }}
        >
          {legendEntries.map((e) => (
            <div key={e.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: LEGEND_SWATCH, height: LEGEND_SWATCH,
                  background: e.swatch, borderRadius: 2,
                }}
              />
              <span style={{ color: e.labelColor }}>{e.label}</span>
            </div>
          ))}
        </div>

        {/* Methodology strip — bottom-left, fades in late. */}
        <div
          style={{
            position: "absolute",
            left: METHOD_STRIP.left, bottom: METHOD_STRIP.bottom,
            ...MONOSPACE_FONT,
            fontSize: METHOD_STRIP.fontSize,
            letterSpacing: METHOD_STRIP.letterSpacing,
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: methodFade.opacity, transform: methodFade.transform,
          }}
        >
          {METHOD_FOOTNOTES.speed}
        </div>
      </div>
    </SlideShell>
  );
};
