import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN, EASE_OUT } from "../../../config/easing";
import {
  MONOSPACE_FONT,
  REGULAR_FONT,
  SERIF_FONT,
  TITLE_FONT,
} from "../../../config/fonts";
import { SAFE_AREA } from "../../../config/layout";
import type { Theme } from "../../../config/themes";
import { COLORS, INSTITUTIONAL } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { CaptionPipe } from "../../primitives/CaptionPipe";
import { CountUpNumber } from "../../primitives/CountUpNumber";
import { FlourishUnderline } from "../../primitives/FlourishUnderline";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import { READING_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 7-phase frame budget (60fps). Sum = 720 = 12s. */
const PHASES = [20, 80, 40, 70, 100, 60, 350] as const;

/** Absolute frame at which the first body chunk enters. Deliberately earlier
 *  than `pClause.start` (210) so the clause begins while the 80% count-up is
 *  still settling — ties the statistic visually to the words around it. */
const CHUNK_START_DELAY = 180;
const CHUNK_STAGGER = 25; // 4 chunks land at 180 / 205 / 230 / 255.

// --- Hero count-up glow --------------------------------------------------- //
// A 2px Miami-red bar beneath "80%" — post-settle whisper that echoes the
// flourish about to appear under "training models". Draws in, holds, fades.
// Modeled after `MotionLine` semantics but implemented as a scaleX transform
// so the bar auto-sizes to the glyph box of `CountUpNumber`'s phantom sibling.
const GLOW_DRAW_START = 172;
const GLOW_DRAW_END = 192;
const GLOW_FADE_START = 202;
const GLOW_FADE_END = 220;
const GLOW_PEAK_OPACITY = 0.35;
const GLOW_HEIGHT = 2;
const GLOW_GAP_BELOW_HERO = 12;

// --- Flourish under "training models" ------------------------------------- //
// Draw-in 285→325, hold 325→474, draw-out 474→555 (primitive-internal timing).
const FLOURISH_DELAY = 285;

// --- Left column typography ladder ---------------------------------------- //
const LEFT_COLUMN_WIDTH = 720;
const COLUMN_GAP = 96;
const RIGHT_COLUMN_MAX = 760;

const LEDE_FONT_SIZE = 32;
const HERO_FONT_SIZE = 220;
const BODY_FONT_SIZE = 44;
const BODY_LINE_HEIGHT = 56;
const EMPHASIS_FONT_SIZE = 52; // ~1.18× body — matches cap-height of body.

// --- Activity Ledger chart ------------------------------------------------ //
const LEDGER_EYEBROW_DELAY = 210;
const LEDGER_HAIRLINE_DELAY = 210;
const LEDGER_HAIRLINE_FRAMES = 30;
const LEDGER_ROWS_START_DELAY = 228;
const LEDGER_ROWS_STEP = 12;
const LEDGER_BAR_START = 240;
const LEDGER_BAR_STEP = 12;
const LEDGER_BAR_DURATION = 24;
const LEDGER_PCT_AFTER_BAR = 4;
const LEDGER_PCT_DURATION = 18;
const LEDGER_SOURCE_DELAY = 340;

const LEDGER_ROW_HEIGHT = 64;
const LEDGER_ROW_GAP = 12;
const LEDGER_LABEL_WIDTH = 260;
const LEDGER_TRACK_WIDTH = 440;
const LEDGER_TRACK_HEIGHT = 10;
const LEDGER_PCT_WIDTH = 60;
/** Percentage width that saturates the track. Even the widest row (26%) leaves
 *  headroom so the chart never reads as maxed-out. */
const LEDGER_MAX_TRACK_PCT = 30;

const FOOTNOTE_HAIRLINE_FRAMES = 30;

type SevenPhases = [
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
];
type FourChunks = [StaggeredItem, StaggeredItem, StaggeredItem, StaggeredItem];

type ActivityRow = {
  label: string;
  pct: number;
  color: string;
  /** Training row — painted Miami Red to rhyme with the hero statistic. */
  isHero?: boolean;
};

/** Time-allocation breakdown. Training is pinned last (regardless of rank)
 *  so the rhetorical beat closes the right column in the same place the left
 *  sentence closes on "training models". */
const ACTIVITY_ROWS: readonly ActivityRow[] = [
  { label: "Data cleansing",     pct: 26, color: "#2E2E2E" },
  { label: "Data preparation",   pct: 20, color: "#4F4F4F" },
  { label: "Data visualization", pct: 14, color: "#6B6B6B" },
  { label: "Model deployment",   pct: 11, color: "#8A8A8A" },
  { label: "Reporting / other",  pct:  9, color: "#B0B0B0" },
  { label: "Model training",     pct: 20, color: INSTITUTIONAL.MIAMI_RED, isHero: true },
];

/**
 * Cold-open hook (12s / 720f).
 *
 * Layout is a two-column flex row under the slide's eyebrow+divider. Left
 * column is a fixed-width typographic stack culminating in the serif
 * "training models." phrase under a hand-drawn flourish. Right column is an
 * activity ledger chart whose terminal "Model training" row lands on Miami
 * Red — one red thread across three red moments (80% / flourish / bar).
 */
export const HookSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const [, pType, , pHero, , pFootnote] = useTimeline([...PHASES]) as SevenPhases;
  const c = COLORS[theme];
  const frame = useCurrentFrame();

  const chunks = useStaggeredFadeIn(4, {
    step: CHUNK_STAGGER,
    startDelay: CHUNK_START_DELAY,
    translateY: 8,
    damping: 180,
  }) as FourChunks;

  // Glow under 80% — `scaleX` carries the MotionLine-like draw-in; a separate
  // opacity interpolation handles the 10f hold and 18f fade-out. Neither curve
  // is active simultaneously, so combining them gives a clean draw→hold→fade.
  const glowScaleX = interpolate(
    frame,
    [GLOW_DRAW_START, GLOW_DRAW_END],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const glowOpacity = interpolate(
    frame,
    [GLOW_FADE_START, GLOW_FADE_END],
    [GLOW_PEAK_OPACITY, 0],
    { easing: EASE_IN, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const footnoteOpacity = interpolate(pFootnote.t, [0, 1], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SlideShell theme={theme} eyebrow="CSE 449 · CAPSTONE">
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: COLUMN_GAP,
        }}
      >
        {/* ===== Left column — typographic ladder ===== */}
        <div style={{ width: LEFT_COLUMN_WIDTH, flexShrink: 0 }}>
          {/* Lede */}
          <div
            style={{
              ...REGULAR_FONT,
              fontSize: LEDE_FONT_SIZE,
              fontWeight: 500,
              lineHeight: "40px",
              letterSpacing: "-0.005em",
              color: c.WORD_COLOR_ON_BG_GREYED,
            }}
          >
            <TypeOnText
              text="Data scientists spend"
              rate={READING_RATE}
              delay={pType.start}
              caret={false}
            />
          </div>

          {/* Hero 80% (own line) + Miami-red glow whisper beneath it */}
          <div style={{ marginTop: 24 }}>
            <span
              style={{
                position: "relative",
                display: "inline-block",
                lineHeight: 1,
              }}
            >
              <CountUpNumber
                to={80}
                delay={pHero.start}
                style={{
                  ...TITLE_FONT,
                  fontSize: HERO_FONT_SIZE,
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  color: INSTITUTIONAL.MIAMI_RED,
                }}
              />
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: `calc(100% + ${GLOW_GAP_BELOW_HERO}px)`,
                  width: "100%",
                  height: GLOW_HEIGHT,
                  background: INSTITUTIONAL.MIAMI_RED,
                  transformOrigin: "left center",
                  transform: `scaleX(${glowScaleX})`,
                  opacity: glowOpacity,
                  borderRadius: GLOW_HEIGHT / 2,
                }}
              />
            </span>
          </div>

          {/* Body line (TITLE 44) — three chunks. `except` is kept on this line
           *  so the serif "training models." owns its own line below. */}
          <div
            style={{
              marginTop: 40,
              ...TITLE_FONT,
              fontSize: BODY_FONT_SIZE,
              fontWeight: 700,
              lineHeight: `${BODY_LINE_HEIGHT}px`,
              letterSpacing: "-0.02em",
              color: c.WORD_COLOR_ON_BG_APPEARED,
            }}
          >
            <Chunk item={chunks[0]}>of their time{"\u00A0"}</Chunk>
            <Chunk item={chunks[1]}>on everything{"\u00A0"}</Chunk>
            <Chunk item={chunks[2]}>except</Chunk>
          </div>

          {/* Emphasis line (SERIF 52) — wrapped in a relative inline-block so
           *  the flourish can anchor to the phrase's own bounding box. */}
          <div
            style={{
              ...SERIF_FONT,
              fontSize: EMPHASIS_FONT_SIZE,
              fontWeight: 400,
              lineHeight: `${BODY_LINE_HEIGHT}px`,
              letterSpacing: "-0.005em",
              color: c.WORD_COLOR_ON_BG_APPEARED,
            }}
          >
            <span style={{ position: "relative", display: "inline-block" }}>
              <Chunk item={chunks[3]}>training models.</Chunk>
              <FlourishUnderline
                delay={FLOURISH_DELAY}
                style={{
                  position: "absolute",
                  top: "calc(100% - 2px)",
                  left: 0,
                  width: "100%",
                  height: 18,
                }}
              />
            </span>
          </div>
        </div>

        {/* ===== Right column — activity ledger ===== */}
        <div style={{ flex: 1, maxWidth: RIGHT_COLUMN_MAX }}>
          <ActivityLedger theme={theme} />
        </div>
      </div>

      {/* Bottom-anchored citation — tracked uppercase with CaptionPipe
       *  separators, matching TitleSlide's institutional caption pattern. */}
      <CitationFootnote
        theme={theme}
        delay={pFootnote.start}
        opacity={footnoteOpacity}
      />
    </SlideShell>
  );
};

// ---------------------------------------------------------------------------
// Inline helpers
// ---------------------------------------------------------------------------

/** Stagger-animated word fragment. Inherits font + size from the parent line
 *  so the outer container is the single source of typographic truth. */
const Chunk: React.FC<{
  item: StaggeredItem;
  children: React.ReactNode;
}> = ({ item, children }) => (
  <span
    style={{
      opacity: item.opacity,
      transform: item.transform,
      display: "inline-block",
    }}
  >
    {children}
  </span>
);

const CitationFootnote: React.FC<{
  theme: Theme;
  delay: number;
  opacity: number;
}> = ({ theme, delay, opacity }) => {
  const c = COLORS[theme];
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE_AREA.contentLeft,
        bottom: SAFE_AREA.bottom + 40,
        opacity,
      }}
    >
      <MotionLine
        x1={0}
        y1={0}
        x2={240}
        y2={0}
        delay={delay}
        durationInFrames={FOOTNOTE_HAIRLINE_FRAMES}
        color={c.WORD_COLOR_ON_BG_GREYED}
        strokeWidth={2}
        svgWidth={240}
        svgHeight={2}
      />
      <div
        style={{
          ...REGULAR_FONT,
          marginTop: 14,
          fontSize: 19,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          lineHeight: 1.3,
          color: "rgba(23, 23, 23, 0.82)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <span>Anaconda</span>
        <CaptionPipe />
        <span>State of Data Science</span>
        <CaptionPipe />
        <span>2022</span>
      </div>
    </div>
  );
};

/** Activity ledger — sorted horizontal bar list showing how a data scientist's
 *  week actually splits. Deterministic animations (pure `interpolate`) so the
 *  chart is fully seekable. */
const ActivityLedger: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const eyebrowFade = useFadeIn({
    delay: LEDGER_EYEBROW_DELAY,
    translateY: 4,
    damping: 180,
  });
  const rowFades = useStaggeredFadeIn(ACTIVITY_ROWS.length, {
    step: LEDGER_ROWS_STEP,
    startDelay: LEDGER_ROWS_START_DELAY,
    translateY: 8,
    damping: 180,
  });
  const sourceFade = useFadeIn({
    delay: LEDGER_SOURCE_DELAY,
    translateY: 2,
    damping: 180,
  });

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Eyebrow */}
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: eyebrowFade.opacity,
          transform: eyebrowFade.transform,
          lineHeight: 1,
        }}
      >
        Time Allocation
        <CaptionPipe />
        Self-reported
      </div>

      {/* Hairline */}
      <div style={{ marginTop: 10 }}>
        <MotionLine
          x1={0}
          y1={0}
          x2={320}
          y2={0}
          delay={LEDGER_HAIRLINE_DELAY}
          durationInFrames={LEDGER_HAIRLINE_FRAMES}
          color="#E5E5E5"
          strokeWidth={2}
          svgWidth={320}
          svgHeight={2}
        />
      </div>

      {/* Rows */}
      <div
        style={{
          marginTop: 30,
          display: "flex",
          flexDirection: "column",
          gap: LEDGER_ROW_GAP,
        }}
      >
        {ACTIVITY_ROWS.map((row, i) => {
          const barStart = LEDGER_BAR_START + i * LEDGER_BAR_STEP;
          const barEnd = barStart + LEDGER_BAR_DURATION;
          const barTargetWidth =
            (row.pct / LEDGER_MAX_TRACK_PCT) * LEDGER_TRACK_WIDTH;
          const barWidth = interpolate(
            frame,
            [barStart, barEnd],
            [0, barTargetWidth],
            {
              easing: EASE_OUT,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );
          const pctStart = barEnd + LEDGER_PCT_AFTER_BAR;
          const pctEnd = pctStart + LEDGER_PCT_DURATION;
          const pctOpacity = interpolate(
            frame,
            [pctStart, pctEnd],
            [0, 1],
            {
              easing: EASE_OUT,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );
          const labelColor = row.isHero
            ? INSTITUTIONAL.MIAMI_RED
            : c.WORD_COLOR_ON_BG_APPEARED;
          const rowFade = rowFades[i]!;

          return (
            <div
              key={row.label}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                height: LEDGER_ROW_HEIGHT,
                opacity: rowFade.opacity,
                transform: rowFade.transform,
              }}
            >
              <div
                style={{
                  ...REGULAR_FONT,
                  fontSize: 22,
                  fontWeight: 500,
                  width: LEDGER_LABEL_WIDTH,
                  color: labelColor,
                  letterSpacing: "-0.005em",
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  width: LEDGER_TRACK_WIDTH,
                  height: LEDGER_TRACK_HEIGHT,
                  background: "#F0F0F0",
                  borderRadius: LEDGER_TRACK_HEIGHT / 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: barWidth,
                    height: "100%",
                    background: row.color,
                    borderRadius: LEDGER_TRACK_HEIGHT / 2,
                  }}
                />
              </div>
              <div
                style={{
                  ...MONOSPACE_FONT,
                  fontSize: 20,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  width: LEDGER_PCT_WIDTH,
                  marginLeft: 16,
                  textAlign: "right",
                  color: row.color,
                  opacity: pctOpacity,
                }}
              >
                {row.pct}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Source line */}
      <div
        style={{
          marginTop: 30,
          ...REGULAR_FONT,
          fontSize: 14,
          fontWeight: 500,
          color: "rgba(23, 23, 23, 0.45)",
          letterSpacing: "0.01em",
          opacity: sourceFade.opacity,
          transform: sourceFade.transform,
        }}
      >
        Anaconda State of Data Science, 2022 · n = 3,493
      </div>
    </div>
  );
};
