import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ARCH_PALETTE } from "../../../config/arch-layout";
import {
  GUARDRAIL_FLAWS,
  GUARDRAIL_SKLEARN_TOTAL,
  GUARDRAIL_US_TOTAL,
  METHOD_FOOTNOTES,
} from "../../../config/benchmarks-content";
import {
  BENCHMARKS_PALETTE,
  GUARDRAILS,
  METHOD_STRIP,
  SEQ_COUNTER,
} from "../../../config/benchmarks-layout";
import { EASE_OUT, SPRING_UI } from "../../../config/easing";
import {
  MONOSPACE_FONT,
  REGULAR_FONT,
  SERIF_FONT,
  TITLE_FONT,
} from "../../../config/fonts";
import { COLORS, type Theme } from "../../../config/themes";
import { blendColor } from "../../helpers/colorBlend";
import { useFadeIn } from "../../helpers/useFadeIn";
import { BreathingHaloRing } from "../../primitives/NodeHaloRing";
import { MotionLine } from "../../primitives/MotionLine";
import { ScaleInNumber } from "../../primitives/ScaleInNumber";
import { SlideShell } from "../../primitives/SlideShell";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 10-phase timeline (sum = 1200 = 20s @ 60fps).
 *  0: AbsoluteFill fade-in                         30f
 *  1: title fade                                   60f
 *  2: legend fade                                  30f
 *  3: column headers + underlines draw             30f
 *  4: rows enter (10 × 18f stagger + 24 bleed)    180f
 *  5: our-platform status flips (10 × 24f)        240f
 *  6: sklearn-baseline status flips (10 × 24f)    240f
 *  7: hero numeral spring — 16/20 then 3/20        60f
 *  8: methodology strip fades in                   30f
 *  9: closer darken + halo + reading hold         300f
 */
const PHASES = [30, 60, 30, 30, 180, 240, 240, 60, 30, 300] as const;

type TenPhases = [
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
];

const TITLE = "Ten flaws in the data. How many get flagged?";
const LEGEND =
  "2 pts each \u00B7 10 flaws \u00B7 20 max \u00B7 scored on tool intent";

const ROW_ENTER_STAGGER = 18; // per-row enter offset within phase 4
const ROW_ENTER_FRAMES = 24; // per-row enter duration (fade+rise)
const STATUS_FLIP_FRAMES = 20; // per-dot color/glyph crossfade
const STATUS_FLIP_STAGGER = 24; // per-dot stride within phases 5/6
const HEADER_UNDERLINE_WIDTH = 96;
const OVERLAY_FADE_FRAMES = 90;
const OVERLAY_PEAK = 0.55; // reduced from 0.85 per QA — don't erase the table
const HERO_BASELINE_OFFSET = 30; // 3/20 lands 30f after 16/20

// -----------------------------------------------------------------------------
// StatusDot — 14×14 circle with pre-flip → caught|missed crossfade.
// Fixed x within its row so both dots line up with the column headers.
// -----------------------------------------------------------------------------
type StatusDotProps = {
  theme: Theme;
  x: number;
  caught: boolean;
  flipFrame: number;
};

const StatusDot: React.FC<StatusDotProps> = ({
  theme,
  x,
  caught,
  flipFrame,
}) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const progress = interpolate(
    frame,
    [flipFrame, flipFrame + STATUS_FLIP_FRAMES],
    [0, 1],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const targetColor = caught
    ? BENCHMARKS_PALETTE.trapCaughtGreen
    : BENCHMARKS_PALETTE.trapMissedRed;
  const background = blendColor(
    BENCHMARKS_PALETTE.trapNeutral,
    targetColor,
    progress,
  );
  const borderColor = blendColor(c.BORDER_COLOR, targetColor, progress);
  const glyphOpacity = progress;
  const glyph = caught ? "\u2713" : "\u2717";

  return (
    <div
      style={{
        position: "absolute",
        left: x - 7,
        top: "50%",
        marginTop: -7,
        width: 14,
        height: 14,
        borderRadius: 7,
        background,
        border: `1px solid ${borderColor}`,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          ...TITLE_FONT,
          fontSize: 10,
          fontWeight: 700,
          color: "#FFFFFF",
          lineHeight: 1,
          opacity: glyphOpacity,
          // Negative letterSpacing pulls ✗ off the left edge a touch so it
          // appears optically centered within the 14px well.
          letterSpacing: caught ? 0 : "-0.02em",
        }}
      >
        {glyph}
      </span>
    </div>
  );
};

// -----------------------------------------------------------------------------
// FlawRow — single table row: id (mono) | label (regular) | us dot | sklearn dot
// -----------------------------------------------------------------------------
type Flaw = (typeof GUARDRAIL_FLAWS)[number];
type FlawRowProps = {
  theme: Theme;
  y: number;
  flaw: Flaw;
  enterFrame: number;
  usFlipFrame: number;
  sklearnFlipFrame: number;
};

const FlawRow: React.FC<FlawRowProps> = ({
  theme,
  y,
  flaw,
  enterFrame,
  usFlipFrame,
  sklearnFlipFrame,
}) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const enterProgress = interpolate(
    frame,
    [enterFrame, enterFrame + ROW_ENTER_FRAMES],
    [0, 1],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const opacity = enterProgress;
  const translateY = interpolate(enterProgress, [0, 1], [6, 0]);

  // Dot x-positions are absolute within the row (flex-free) so they line
  // up precisely under the column headers defined in GUARDRAILS.headers.
  const rowX = GUARDRAILS.table.x;
  const usDotLocalX = GUARDRAILS.table.usDotX - rowX;
  const sklearnDotLocalX = GUARDRAILS.table.sklearnDotX - rowX;

  // Label is flex-space between id and the us dot. Truncate with ellipsis
  // if any future label grows long. Max-width keeps it clear of the us dot.
  const labelMaxW = usDotLocalX - GUARDRAILS.table.idW - 24;

  return (
    <div
      style={{
        position: "absolute",
        left: rowX,
        top: y,
        width: GUARDRAILS.table.w,
        height: GUARDRAILS.table.rowH,
        display: "flex",
        alignItems: "center",
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {/* ID — greyed mono. */}
      <div
        style={{
          ...MONOSPACE_FONT,
          fontSize: 12,
          letterSpacing: "0.05em",
          color: c.WORD_COLOR_ON_BG_GREYED,
          width: GUARDRAILS.table.idW,
          flexShrink: 0,
        }}
      >
        {flaw.id}
      </div>
      {/* Label — inked weight-500. */}
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 16,
          fontWeight: 500,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          maxWidth: labelMaxW,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginLeft: 8,
        }}
      >
        {flaw.label}
      </div>
      {/* Status dots — absolute x so they align under headers. */}
      <StatusDot
        theme={theme}
        x={usDotLocalX}
        caught={flaw.us.caught}
        flipFrame={usFlipFrame}
      />
      <StatusDot
        theme={theme}
        x={sklearnDotLocalX}
        caught={flaw.sklearn.caught}
        flipFrame={sklearnFlipFrame}
      />
    </div>
  );
};

export const BenchmarksGuardrailsSlide: React.FC<SlideBodyProps> = ({
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phases = useTimeline([...PHASES]) as TenPhases;
  const pFade = phases[0];
  const pTitle = phases[1];
  const pLegend = phases[2];
  const pHeaders = phases[3];
  const pRowsEnter = phases[4];
  const pUsFlip = phases[5];
  const pSklearnFlip = phases[6];
  const pHero = phases[7];
  const pMethod = phases[8];
  const pCloser = phases[9];
  const c = COLORS[theme];

  const fade = useFadeIn({ delay: pFade.start, durationInFrames: 30 });
  const title = useFadeIn({
    delay: pTitle.start,
    translateY: 12,
    damping: 200,
  });
  const legend = useFadeIn({ delay: pLegend.start, damping: 200 });
  const usHeader = useFadeIn({
    delay: pHeaders.start,
    translateY: 4,
    damping: 200,
  });
  const sklearnHeader = useFadeIn({
    delay: pHeaders.start,
    translateY: 4,
    damping: 200,
  });
  const methodFade = useFadeIn({
    delay: pMethod.start,
    translateY: 4,
    damping: 200,
  });

  // Baseline 3/20 — SPRING_UI settle, 30f after 16/20 lands.
  const baselineProgress = spring({
    fps,
    frame: frame - pHero.start - HERO_BASELINE_OFFSET,
    config: SPRING_UI,
    durationInFrames: 24,
  });
  const baselineScale = interpolate(baselineProgress, [0, 1], [0.96, 1]);
  const baselineOpacity = baselineProgress;

  // "vs" separator — fades between the two numerals.
  const vsProgress = spring({
    fps,
    frame: frame - pHero.start - 12,
    config: SPRING_UI,
    durationInFrames: 18,
  });
  const vsOpacity = vsProgress;
  const vsTranslate = interpolate(vsProgress, [0, 1], [6, 0]);

  // Closer-darken overlay — peaks at 0.55 (reduced) so the table stays legible.
  const overlayOpacity = interpolate(
    frame,
    [pCloser.start, pCloser.start + OVERLAY_FADE_FRAMES],
    [0, OVERLAY_PEAK],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <SlideShell theme={theme} eyebrow="GUARDRAILS" divider footer>
      <div style={{ position: "absolute", inset: 0, opacity: fade.opacity }}>
        {/* Title — single-line fade + translateY. */}
        <div
          style={{
            position: "absolute",
            left: GUARDRAILS.title.left,
            top: GUARDRAILS.title.top,
            width: GUARDRAILS.title.width,
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
          {TITLE}
        </div>

        {/* Legend — "2 pts each · 10 flaws · 20 max · scored on tool intent". */}
        <div
          style={{
            position: "absolute",
            left: GUARDRAILS.legend.x,
            top: GUARDRAILS.legend.y,
            ...MONOSPACE_FONT,
            fontSize: GUARDRAILS.legend.fontSize,
            letterSpacing: "0.05em",
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: legend.opacity,
          }}
        >
          {LEGEND}
        </div>

        {/* Column header LEFT — OUR PLATFORM, centered over us-dot column. */}
        <div
          style={{
            position: "absolute",
            left: GUARDRAILS.headers.usCenterX,
            top: GUARDRAILS.headers.y,
            transform: `translateX(-50%) translateY(${usHeader.translateY}px)`,
            opacity: usHeader.opacity,
            textAlign: "center",
          }}
        >
          <div
            style={{
              ...TITLE_FONT,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: c.WORD_COLOR_ON_BG_APPEARED,
              lineHeight: 1,
            }}
          >
            Our Platform
          </div>
        </div>
        {/* Accent-blue hairline under OUR PLATFORM header. */}
        <div
          style={{
            position: "absolute",
            left: GUARDRAILS.headers.usCenterX - HEADER_UNDERLINE_WIDTH / 2,
            top: GUARDRAILS.headers.hairlineY,
            opacity: usHeader.opacity,
          }}
        >
          <MotionLine
            x1={0}
            y1={0}
            x2={HEADER_UNDERLINE_WIDTH}
            y2={0}
            svgWidth={HEADER_UNDERLINE_WIDTH}
            svgHeight={2}
            strokeWidth={2}
            delay={pHeaders.start}
            durationInFrames={30}
            color={ARCH_PALETTE.accentBlue}
          />
        </div>

        {/* Column header RIGHT — SKLEARN BASELINE, greyed + muted hairline. */}
        <div
          style={{
            position: "absolute",
            left: GUARDRAILS.headers.sklearnCenterX,
            top: GUARDRAILS.headers.y,
            transform: `translateX(-50%) translateY(${sklearnHeader.translateY}px)`,
            opacity: sklearnHeader.opacity,
            textAlign: "center",
          }}
        >
          <div
            style={{
              ...TITLE_FONT,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: c.WORD_COLOR_ON_BG_GREYED,
              lineHeight: 1,
            }}
          >
            Sklearn Baseline
          </div>
        </div>
        {/* Muted hairline under SKLEARN BASELINE — matches baseline column. */}
        <div
          style={{
            position: "absolute",
            left:
              GUARDRAILS.headers.sklearnCenterX - HEADER_UNDERLINE_WIDTH / 2,
            top: GUARDRAILS.headers.hairlineY,
            opacity: sklearnHeader.opacity,
          }}
        >
          <MotionLine
            x1={0}
            y1={0}
            x2={HEADER_UNDERLINE_WIDTH}
            y2={0}
            svgWidth={HEADER_UNDERLINE_WIDTH}
            svgHeight={2}
            strokeWidth={2}
            delay={pHeaders.start}
            durationInFrames={30}
            color={ARCH_PALETTE.hairline}
          />
        </div>

        {/* Unified 10-row flaw table. Rows enter staggered; status dots flip
         *  left side first (phase 5), then right side (phase 6). */}
        {GUARDRAIL_FLAWS.map((f, i) => {
          const rowY =
            GUARDRAILS.table.y +
            i * (GUARDRAILS.table.rowH + GUARDRAILS.table.rowGap);
          return (
            <FlawRow
              key={f.id}
              theme={theme}
              y={rowY}
              flaw={f}
              enterFrame={pRowsEnter.start + i * ROW_ENTER_STAGGER}
              usFlipFrame={pUsFlip.start + i * STATUS_FLIP_STAGGER}
              sklearnFlipFrame={pSklearnFlip.start + i * STATUS_FLIP_STAGGER}
            />
          );
        })}

        {/* Closer-darken overlay — covers the table (z:2), below hero (z:3). */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: c.BACKGROUND,
            opacity: overlayOpacity,
            pointerEvents: "none",
            zIndex: 2,
          }}
        />

        {/* Hero band — 16/20 vs 3/20. The BreathingHaloRing fades in during
         *  the closer-darken to re-anchor attention on the winning numeral. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: GUARDRAILS.hero.y,
            height: GUARDRAILS.hero.h,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 80,
            zIndex: 3,
          }}
        >
          {/* 16 / 20 — hero numeral in accent blue, wrapped with a halo that
           *  breathes in during the closer-darken phase. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                ...TITLE_FONT,
                fontSize: 104,
                fontWeight: 700,
                color: ARCH_PALETTE.accentBlue,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                position: "relative",
              }}
            >
              <ScaleInNumber
                value={`${GUARDRAIL_US_TOTAL} / 20`}
                delay={pHero.start}
              />
              {/* Subtle breathing halo during the closer — re-anchors focus
               *  on 16/20 while the overlay dims the supporting table. */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: interpolate(
                    frame,
                    [pCloser.start, pCloser.start + OVERLAY_FADE_FRAMES],
                    [0, 0.6],
                    {
                      easing: EASE_OUT,
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    },
                  ),
                }}
              >
                <BreathingHaloRing
                  x={-24}
                  y={-12}
                  w={360}
                  h={160}
                  radius={20}
                  at={pCloser.start}
                  periodFrames={120}
                  color={ARCH_PALETTE.accentBlue}
                  minOpacity={0.15}
                  maxOpacity={0.45}
                  minScale={1.0}
                  maxScale={1.02}
                  strokeWidth={2}
                />
              </div>
            </div>
            <div
              style={{
                ...REGULAR_FONT,
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: c.WORD_COLOR_ON_BG_GREYED,
                marginTop: 8,
              }}
            >
              flaws caught
            </div>
          </div>

          {/* vs — serif separator with editorial tracking. */}
          <div
            style={{
              ...SERIF_FONT,
              fontSize: 56,
              letterSpacing: "0.05em",
              color: c.WORD_COLOR_ON_BG_GREYED,
              opacity: vsOpacity,
              transform: `translateY(${vsTranslate}px)`,
              lineHeight: 1,
            }}
          >
            vs
          </div>

          {/* 3 / 20 — baseline numeral in saturated red, SPRING_UI settle. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                ...TITLE_FONT,
                fontSize: 104,
                fontWeight: 700,
                color: BENCHMARKS_PALETTE.trapMissedRed,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                transform: `scale(${baselineScale})`,
                transformOrigin: "center",
                opacity: baselineOpacity,
              }}
            >
              {GUARDRAIL_SKLEARN_TOTAL} / 20
            </div>
            <div
              style={{
                ...REGULAR_FONT,
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: c.WORD_COLOR_ON_BG_GREYED,
                marginTop: 8,
                opacity: baselineOpacity,
              }}
            >
              flaws caught
            </div>
          </div>
        </div>

        {/* Top-right sequence counter. */}
        <div
          style={{
            position: "absolute",
            right: SEQ_COUNTER.right,
            top: SEQ_COUNTER.top,
            ...MONOSPACE_FONT,
            fontSize: SEQ_COUNTER.fontSize,
            color: ARCH_PALETTE.mute,
          }}
        >
          04 / 04
        </div>

        {/* Methodology strip — fades in during phase 8. */}
        <div
          style={{
            position: "absolute",
            left: METHOD_STRIP.left,
            bottom: METHOD_STRIP.bottom,
            ...MONOSPACE_FONT,
            fontSize: METHOD_STRIP.fontSize,
            letterSpacing: METHOD_STRIP.letterSpacing,
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: methodFade.opacity,
            transform: methodFade.transform,
          }}
        >
          {METHOD_FOOTNOTES.guardrails}
        </div>
      </div>
    </SlideShell>
  );
};
