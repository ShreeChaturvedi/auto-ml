import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN_OUT, EASE_OUT, SPRING_SETTLE } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 8-phase frame budget (60fps). Sum = 1440 = 24s.
 *   1. 0–20      eyebrow + heading
 *   2. 20–80     axis draws left→right
 *   3. 80–380    4 markers on 75f beat (80/155/230/305): tick + dot + year + supporting line
 *   4. 380–440   2026 "easy 20%" single pulse (opacity 1→0.3→1, 30f EASE_IN_OUT)
 *   5. 440–600   timeline translates up 120px; two cards rise with 60f stagger
 *   6. 600–1200  bullet items reveal 10f stagger
 *   7. 1200–1380 right-card accent bar draws + closing serif fades in
 *   8. 1380–1440 hold */
const PHASES = [20, 60, 300, 60, 160, 600, 180, 60] as const;

type EightPhases = [
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
];

// --- Timeline geometry -------------------------------------------------------
const AXIS_WIDTH = 1440;
const AXIS_DRAW_FRAMES = 48;
const AXIS_Y = 260;
const DOT_RADIUS = 6;
const TICK_HEIGHT = 24;
/** Marker beats: 75f cadence inside phase 3 (80, 155, 230, 305). */
const MARKER_BEATS = [80, 155, 230, 305] as const;
const MARKER_IN_FRAMES = 30;
const MARKER_TICK_DRAW = 20;
const MARKER_YEAR_DELAY = 12;
const MARKER_LINE_DELAY = 24;
const MARKER_LINE_FADE = 30;
const SUPPORT_MAX_WIDTH = 300;

// --- Phase-4 pulse for "easy 20%" -------------------------------------------
const PULSE_START = 395;
const PULSE_DURATION = 30;

// --- Phase-5 timeline lift + card stagger -----------------------------------
const TIMELINE_LIFT_PX = 120;
const CARD_STAGGER = 60;
const CARD_TRANSLATE_Y = 24;

// --- Card layout (mirrors ProblemTrioSlide treatment) -----------------------
const CARD_WIDTH = 700;
const CARD_GAP = 40;
const CARD_PADDING = 36;
const CARD_RADIUS = 8;
/** Matches app `shadow-sm` (light-mode card.tsx). */
const CARD_SHADOW = "0 2px 12px rgba(0, 0, 0, 0.04)";
/** Mirrors app `--border-subtle`. */
const CARD_BORDER = "rgba(0, 0, 0, 0.10)";

// --- Bullet list reveal -----------------------------------------------------
const BULLET_STAGGER = 10;
const BULLET_TRANSLATE_Y = 6;

// --- Phase 7 — accent bar + closing serif -----------------------------------
const ACCENT_BAR_WIDTH = 2;
const ACCENT_BAR_DRAW = 48;
const CLOSING_DELAY_OFFSET = 24;

// --- Timeline markers -------------------------------------------------------
type TimelineMarker = {
  year: string;
  /** x-offset along the 1440px axis (evenly spaced regardless of year gap). */
  x: number;
  supporting: string;
  /** True on the 2026 inflection marker — dot + the inline "easy 20%" phrase
   *  carry ACCENT_COLOR. */
  accent?: boolean;
};

const TIMELINE_MARKERS: readonly TimelineMarker[] = [
  {
    year: "2020",
    x: 0,
    supporting: "Transformer-scale LLMs arrive. Workflow orchestration still brittle.",
  },
  {
    year: "2023",
    x: 480,
    supporting: "ReAct + tool use. Agents can finally reason over context.",
  },
  {
    year: "2024",
    x: 960,
    supporting: "LangGraph, MCP, Responses API. Durable, typed, observable agents.",
  },
  {
    year: "2026",
    x: 1440,
    supporting: "", // rendered inline with ACCENT_COLOR span (see Accent2026Supporting)
    accent: true,
  },
] as const;

const LEFT_PANEL_HEADER = "What AutoML automated";
const LEFT_PANEL_ITEMS = [
  "model search",
  "hyperparameter tuning",
  "train/test split",
  "metric evaluation",
] as const;

const RIGHT_PANEL_HEADER = "What it didn't";
const RIGHT_PANEL_ITEMS = [
  "domain framing",
  "data profiling",
  "transformation approval",
  "feature hypotheses",
  "error triage",
  "handoff",
] as const;

// --- Shared style constants --------------------------------------------------
const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 48,
  letterSpacing: "-0.025em",
  lineHeight: 1.15,
  maxWidth: 1500,
  marginTop: 8,
  marginBottom: 40,
  textWrap: "balance",
};

const YEAR_LABEL_STYLE: React.CSSProperties = {
  ...MONOSPACE_FONT,
  fontSize: 18,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.1,
  textAlign: "center",
};

const SUPPORT_LINE_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontSize: 16,
  lineHeight: 1.45,
  textAlign: "center",
  maxWidth: SUPPORT_MAX_WIDTH,
};

const CARD_HEADER_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 24,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
};

const CARD_ITEM_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontSize: 18,
  lineHeight: 1.6,
};

const CLOSING_STYLE: React.CSSProperties = {
  ...SERIF_FONT,
  fontSize: 36,
  letterSpacing: "0em",
  lineHeight: 1.2,
  textAlign: "center",
};

/**
 * WhyNowSlide — industry timeline to the 2026 inflection point (24s / 1440f).
 *
 * Sole accent colorants: the 2026 dot, the inline "easy 20%" phrase on the
 * 2026 supporting line, and the right-card's 2px accent bar.
 */
export const WhyNowSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const [
    ,
    pAxis,
    ,
    pPulse,
    pLift,
    pBullets,
    pClose,
  ] = useTimeline([...PHASES]) as EightPhases;
  const c = COLORS[theme];

  // Phase 5 — timeline lifts up 120px while cards rise. Progress runs the full
  // lift window, then holds at the lifted position for the rest of the slide.
  const liftProgress = interpolate(
    frame,
    [pLift.start, pLift.end],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const liftY = interpolate(liftProgress, [0, 1], [0, -TIMELINE_LIFT_PX]);

  // Phase 5 — two cards, 60f stagger.
  const cards = useStaggeredFadeIn(2, {
    step: CARD_STAGGER,
    startDelay: pLift.start,
    translateY: CARD_TRANSLATE_Y,
    damping: SPRING_SETTLE.damping,
  });

  // Phase 7 — closing serif line fades in alongside the accent bar draw.
  const closingFade = useFadeIn({
    translateY: 8,
    delay: pClose.start + CLOSING_DELAY_OFFSET,
  });

  return (
    <SlideShell theme={theme} eyebrow="WHY NOW">
      {/* Phase 1 — heading. */}
      <div style={{ ...HEADING_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
        <TypeOnText
          text="The tools have caught up with the ambition."
          rate={LABEL_RATE}
          delay={0}
          caret={false}
        />
      </div>

      {/* Phases 2–5 — timeline container. Lifts -120px across phase 5. */}
      <div
        style={{
          position: "relative",
          width: AXIS_WIDTH,
          margin: "0 auto",
          transform: `translateY(${liftY}px)`,
        }}
      >
        {/* Axis — drawn left→right over 48f in phase 2. */}
        <div style={{ position: "absolute", top: AXIS_Y, left: 0 }}>
          <MotionLine
            x1={0}
            y1={0}
            x2={AXIS_WIDTH}
            y2={0}
            delay={pAxis.start}
            durationInFrames={AXIS_DRAW_FRAMES}
            color={c.BORDER_COLOR}
            svgWidth={AXIS_WIDTH}
            svgHeight={2}
          />
        </div>

        {/* Phase 3 — markers on 75f beat (absolute frames 80/155/230/305). */}
        {TIMELINE_MARKERS.map((marker, i) => (
          <TimelineMarkerNode
            key={marker.year}
            theme={theme}
            marker={marker}
            beatStart={MARKER_BEATS[i]!}
            pulseFrame={frame}
            pulseActive={!!marker.accent && frame >= pPulse.start}
          />
        ))}
      </div>

      {/* Phase 5+ — two-card row. Sits where the timeline visually vacates. */}
      <div
        style={{
          position: "absolute",
          top: "55%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: CARD_GAP,
          alignItems: "flex-start",
          width: CARD_WIDTH * 2 + CARD_GAP,
        }}
      >
        <PanelCard
          theme={theme}
          header={LEFT_PANEL_HEADER}
          items={LEFT_PANEL_ITEMS}
          enter={cards[0]!}
          bulletsStart={pBullets.start}
          accentBarDelay={null}
        />
        <PanelCard
          theme={theme}
          header={RIGHT_PANEL_HEADER}
          items={RIGHT_PANEL_ITEMS}
          enter={cards[1]!}
          bulletsStart={pBullets.start}
          accentBarDelay={pClose.start}
        />
      </div>

      {/* Phase 7 — closing serif line, centered below the cards. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 80,
          display: "flex",
          justifyContent: "center",
          opacity: closingFade.opacity,
          transform: closingFade.transform,
          pointerEvents: "none",
        }}
      >
        <div style={{ ...CLOSING_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
          We build for the right column.
        </div>
      </div>
    </SlideShell>
  );
};

/** One timeline beat: vertical tick (drawn) + dot (scale-in) + Monaspace year
 *  label (typed) + supporting line (faded). The 2026 variant renders the
 *  inline "easy 20%" pulse in Phase 4 via `Accent2026Supporting`. */
const TimelineMarkerNode: React.FC<{
  theme: Theme;
  marker: TimelineMarker;
  beatStart: number;
  pulseFrame: number;
  pulseActive: boolean;
}> = ({ theme, marker, beatStart, pulseFrame, pulseActive }) => {
  const c = COLORS[theme];

  // Dot scale-in. Springs can feel overshooty at this size — plain EASE_OUT
  // read cleaner during studio preview.
  const dotScale = interpolate(
    pulseFrame,
    [beatStart, beatStart + MARKER_IN_FRAMES],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Supporting line fades from 0 → WORD_COLOR_ON_BG_GREYED alpha.
  const lineOpacity = interpolate(
    pulseFrame,
    [beatStart + MARKER_LINE_DELAY, beatStart + MARKER_LINE_DELAY + MARKER_LINE_FADE],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const dotColor = marker.accent ? c.ACCENT_COLOR : c.WORD_COLOR_ON_BG_APPEARED;

  return (
    <>
      {/* Tick — 24px vertical between dot and axis. Drawn top→bottom. */}
      <div
        style={{
          position: "absolute",
          top: AXIS_Y - TICK_HEIGHT,
          left: marker.x,
        }}
      >
        <MotionLine
          x1={0}
          y1={0}
          x2={0}
          y2={TICK_HEIGHT}
          delay={beatStart}
          durationInFrames={MARKER_TICK_DRAW}
          color={c.BORDER_COLOR}
          svgWidth={2}
          svgHeight={TICK_HEIGHT}
        />
      </div>

      {/* Dot — 6px radius, centered on axis x-intersection. */}
      <div
        style={{
          position: "absolute",
          top: AXIS_Y - DOT_RADIUS,
          left: marker.x - DOT_RADIUS,
          width: DOT_RADIUS * 2,
          height: DOT_RADIUS * 2,
          borderRadius: "50%",
          background: dotColor,
          transform: `scale(${dotScale})`,
          transformOrigin: "center",
        }}
      />

      {/* Year label — Monaspace Neon, tabular-nums, centered above dot. */}
      <div
        style={{
          position: "absolute",
          top: AXIS_Y - TICK_HEIGHT - 30,
          left: marker.x - 40,
          width: 80,
          color: c.WORD_COLOR_ON_BG_APPEARED,
        }}
      >
        <div style={YEAR_LABEL_STYLE}>
          <TypeOnText
            text={marker.year}
            rate={LABEL_RATE}
            delay={beatStart + MARKER_YEAR_DELAY}
            caret={false}
          />
        </div>
      </div>

      {/* Supporting line — Plus Jakarta 500, greyed, centered under axis. */}
      <div
        style={{
          position: "absolute",
          top: AXIS_Y + 24,
          left: marker.x - SUPPORT_MAX_WIDTH / 2,
          width: SUPPORT_MAX_WIDTH,
          opacity: lineOpacity,
        }}
      >
        <div style={{ ...SUPPORT_LINE_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
          {marker.accent ? (
            <Accent2026Supporting
              theme={theme}
              frame={pulseFrame}
              pulseActive={pulseActive}
            />
          ) : (
            marker.supporting
          )}
        </div>
      </div>
    </>
  );
};

/** 2026 supporting line with the "easy 20%" span in ACCENT_COLOR. The span
 *  performs a single pulse (opacity 1 → 0.3 → 1, 30f EASE_IN_OUT) at
 *  PULSE_START — NOT a flicker. Before/after, it holds at opacity 1. */
const Accent2026Supporting: React.FC<{
  theme: Theme;
  frame: number;
  pulseActive: boolean;
}> = ({ theme, frame, pulseActive }) => {
  const c = COLORS[theme];
  const pulseT = (frame - PULSE_START) / PULSE_DURATION;
  const pulseOpacity =
    !pulseActive || pulseT < 0 || pulseT > 1
      ? 1
      : interpolate(pulseT, [0, 0.5, 1], [1, 0.3, 1], {
          easing: EASE_IN_OUT,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  return (
    <>
      AutoML still optimizes the{" "}
      <span style={{ color: c.ACCENT_COLOR, opacity: pulseOpacity }}>
        easy 20%
      </span>
      . The other 80% is human.
    </>
  );
};

/** Left/right column of the two-panel split. The right card receives an
 *  animated 2px accent bar on its leading edge during phase 7 (accentBarDelay
 *  non-null). Bullet items stagger in during phase 6. */
const PanelCard: React.FC<{
  theme: Theme;
  header: string;
  items: readonly string[];
  enter: StaggeredItem;
  bulletsStart: number;
  /** Absolute frame at which the left-edge ACCENT_COLOR bar begins drawing.
   *  `null` for the left card (no accent). */
  accentBarDelay: number | null;
}> = ({ theme, header, items, enter, bulletsStart, accentBarDelay }) => {
  const c = COLORS[theme];
  const bullets = useStaggeredFadeIn(items.length, {
    step: BULLET_STAGGER,
    startDelay: bulletsStart,
    translateY: BULLET_TRANSLATE_Y,
    damping: 200,
  });

  return (
    <div
      style={{
        position: "relative",
        width: CARD_WIDTH,
        padding: CARD_PADDING,
        borderRadius: CARD_RADIUS,
        background: c.BACKGROUND_ELEVATED,
        border: `1px solid ${CARD_BORDER}`,
        boxShadow: CARD_SHADOW,
        opacity: enter.opacity,
        transform: enter.transform,
      }}
    >
      {accentBarDelay !== null ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
          }}
        >
          <MotionLine
            x1={0}
            y1={0}
            x2={0}
            y2={CARD_PADDING * 2 + 32 + items.length * 32}
            delay={accentBarDelay}
            durationInFrames={ACCENT_BAR_DRAW}
            color={c.ACCENT_COLOR}
            strokeWidth={ACCENT_BAR_WIDTH}
            svgWidth={ACCENT_BAR_WIDTH}
            svgHeight={CARD_PADDING * 2 + 32 + items.length * 32}
          />
        </div>
      ) : null}

      <div style={{ ...CARD_HEADER_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
        {header}
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "16px 0 0 0",
        }}
      >
        {items.map((item, i) => (
          <li
            key={item}
            style={{
              ...CARD_ITEM_STYLE,
              color: c.WORD_COLOR_ON_BG_GREYED,
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              opacity: bullets[i]!.opacity,
              transform: bullets[i]!.transform,
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: c.WORD_COLOR_ON_BG_GREYED }}
            >
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
