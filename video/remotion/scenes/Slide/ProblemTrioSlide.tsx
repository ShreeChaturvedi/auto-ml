import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../config/easing";
import { REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import { SAFE_AREA } from "../../../config/layout";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, READING_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 7-phase frame budget (60fps). Sum = 1560 = 26s.
 *   1. 0–20     eyebrow + header divider
 *   2. 20–110   heading; "six different tools" carries sole ACCENT_COLOR
 *   3. 110–200  cards stagger in (15f — mirrors app `card-enter` 250ms)
 *   4. 200–260  per-card headline types at LABEL_RATE + body fades 60→100%
 *   5. 260–1400 hold + PROVISIONAL focus-shifts at 400/720/1040f (revisit
 *               during voiceover pass — off-focus cards dim to 40%)
 *   6. 1400–1500 cards return to full; closing serif + 480px hairline fade in
 *   7. 1500–1560 hold */
const PHASES = [20, 90, 90, 60, 1140, 100, 60] as const;

const CARD_STAGGER = 15;
const CARD_TRANSLATE_Y = 24;
const CARD_SCALE_FROM = 0.985;
/** Usable content width 1704 → 3×480 + 2×32 = 1504 fits. */
const CARD_MIN_WIDTH = 480;
const CARD_GAP = 32;
const CARD_PADDING = 36;
const CARD_RADIUS = 8;
/** Matches app `shadow-sm` (light-mode card.tsx). */
const CARD_SHADOW = "0 2px 12px rgba(0, 0, 0, 0.04)";
/** Mirrors app `--border-subtle`. */
const CARD_BORDER = "rgba(0, 0, 0, 0.10)";

/** Focus-shift — PROVISIONAL, revisit with voiceover. */
const FOCUS_DIM = 0.4;
const FOCUS_CROSSFADE_FRAMES = 20;
const FOCUS_START = [400, 720, 1040] as const;
const FOCUS_END = 1340;

const HAIRLINE_WIDTH = 480;
const HAIRLINE_DRAW_FRAMES = 48;

const PAIN_POINTS = [
  {
    headline: "Six tools, six languages.",
    body: "Jupyter for exploration, dbt for SQL, Python for preprocessing, scikit-learn for training, MLflow for tracking, Streamlit for demo. Context-switches cost more than code.",
  },
  {
    headline: "Expertise compounded.",
    body: "A practitioner must be fluent in SQL, Python, statistics, containers, and MLOps. The median data scientist is fluent in one-and-a-half.",
  },
  {
    headline: "Approvals are invisible.",
    body: "AutoML hides the decisions that matter: which rows to drop, how to encode, when to regularize. Governance in production ML starts with trust in transformation.",
  },
] as const;

type SevenPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];
type ThreeCards = [StaggeredItem, StaggeredItem, StaggeredItem];

const HEADING_LEAD = "A modern ML workflow lives in ";
const HEADING_ACCENT = "six different tools";
const HEADING_TAIL = ".";
const HEADING_LEAD_FRAMES = HEADING_LEAD.length * READING_RATE;
const HEADING_ACCENT_FRAMES = HEADING_ACCENT.length * READING_RATE;

/** Style constants to keep the component body declarative. */
const HEADING_STYLE: React.CSSProperties = {
  ...SERIF_FONT,
  fontSize: 56,
  letterSpacing: "0em",
  lineHeight: 1.2,
  maxWidth: 1500,
  marginTop: 8,
  marginBottom: 56,
  textWrap: "balance",
};
const CARDS_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: CARD_GAP,
  alignItems: "flex-start",
};
const CLOSING_BODY_STYLE: React.CSSProperties = {
  ...SERIF_FONT,
  fontSize: 40,
  letterSpacing: "0em",
  lineHeight: 1.3,
  textAlign: "center",
  maxWidth: 1200,
  marginTop: 32,
  textWrap: "balance",
};
const CARD_HEADLINE_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 28,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
  minHeight: 68,
};
const CARD_BODY_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontSize: 20,
  lineHeight: 1.45,
  marginTop: 16,
};

/**
 * ProblemTrioSlide — three-pain-point fragmentation (26s / 1560f). Sole accent
 * is "six different tools" in the serif heading. Cards match app treatment
 * (8px radius, BACKGROUND_ELEVATED, subtle shadow — see `card.tsx`).
 */
export const ProblemTrioSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const [, pHeading, pStagger, pCopy, , pClose] = useTimeline([...PHASES]) as SevenPhases;
  const c = COLORS[theme];

  const cards = useStaggeredFadeIn(PAIN_POINTS.length, {
    step: CARD_STAGGER,
    startDelay: pStagger.start,
    translateY: CARD_TRANSLATE_Y,
    damping: 200,
  }) as ThreeCards;

  const closingFade = useFadeIn({ translateY: 8, delay: pClose.start });

  return (
    <SlideShell theme={theme} eyebrow="THE PROBLEM">
      {/* Phase 2 — serif heading; accent-color segment inline. */}
      <div style={{ ...HEADING_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
        <TypeOnText text={HEADING_LEAD} delay={pHeading.start} caret={false} />
        <TypeOnText
          text={HEADING_ACCENT}
          delay={pHeading.start + HEADING_LEAD_FRAMES}
          caret={false}
          style={{ color: c.ACCENT_COLOR }}
        />
        <TypeOnText
          text={HEADING_TAIL}
          delay={pHeading.start + HEADING_LEAD_FRAMES + HEADING_ACCENT_FRAMES}
          caret={false}
        />
      </div>

      {/* Phases 3–5 — three pain cards. */}
      <div style={CARDS_ROW_STYLE}>
        {PAIN_POINTS.map((point, i) => (
          <PainCard
            key={point.headline}
            frame={frame}
            index={i}
            theme={theme}
            headline={point.headline}
            body={point.body}
            enter={cards[i] as StaggeredItem}
            copyStart={pCopy.start + i * 8}
            closeStart={pClose.start}
          />
        ))}
      </div>

      {/* Phase 6 — 480px hairline + closing serif line, centered. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: SAFE_AREA.bottom + 40,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: closingFade.opacity,
          transform: closingFade.transform,
          pointerEvents: "none",
        }}
      >
        <MotionLine
          x1={0}
          y1={0}
          x2={HAIRLINE_WIDTH}
          y2={0}
          delay={pClose.start}
          durationInFrames={HAIRLINE_DRAW_FRAMES}
          color={c.BORDER_COLOR}
          svgWidth={HAIRLINE_WIDTH}
          svgHeight={2}
        />
        <div style={{ ...CLOSING_BODY_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
          What if one agentic platform handled the whole pipeline — and kept the
          human in every loop?
        </div>
      </div>
    </SlideShell>
  );
};

/** Per-pain-point card. Headline types at LABEL_RATE; body fades 0→60%→100%. */
const PainCard: React.FC<{
  frame: number;
  index: number;
  theme: Theme;
  headline: string;
  body: string;
  enter: StaggeredItem;
  copyStart: number;
  closeStart: number;
}> = ({ frame, index, theme, headline, body, enter, copyStart, closeStart }) => {
  const c = COLORS[theme];
  const focusOpacity = focusOpacityAt(frame, index, closeStart);
  const scale = interpolate(enter.progress, [0, 1], [CARD_SCALE_FROM, 1]);
  const bodyStart = copyStart + 40;
  const bodyReveal = interpolate(
    frame,
    [copyStart, bodyStart, bodyStart + 30],
    [0, 0.6, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        minWidth: CARD_MIN_WIDTH,
        maxWidth: CARD_MIN_WIDTH,
        padding: CARD_PADDING,
        borderRadius: CARD_RADIUS,
        background: c.BACKGROUND_ELEVATED,
        border: `1px solid ${CARD_BORDER}`,
        boxShadow: CARD_SHADOW,
        opacity: enter.opacity * focusOpacity,
        transform: `translateY(${enter.translateY}px) scale(${scale})`,
      }}
    >
      <div style={{ ...CARD_HEADLINE_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
        <TypeOnText text={headline} rate={LABEL_RATE} delay={copyStart} caret={false} />
      </div>
      <div
        style={{
          ...CARD_BODY_STYLE,
          color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: bodyReveal,
        }}
      >
        {body}
      </div>
    </div>
  );
};

/** PROVISIONAL focus-shift opacity: non-focused cards dim to FOCUS_DIM during
 *  each focus window with 20f crossfades. All cards return to 1 before closing
 *  line. Revisit during voiceover integration. */
const focusOpacityAt = (frame: number, cardIndex: number, closeStart: number): number => {
  if (frame >= closeStart) return 1;
  if (frame < FOCUS_START[0] - FOCUS_CROSSFADE_FRAMES) return 1;

  const half = FOCUS_CROSSFADE_FRAMES / 2;

  if (frame >= FOCUS_END) {
    const wasFocused = cardIndex === FOCUS_START.length - 1;
    return interpolate(
      frame,
      [FOCUS_END, FOCUS_END + FOCUS_CROSSFADE_FRAMES],
      [wasFocused ? 1 : FOCUS_DIM, 1],
      { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  const keyframes: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < FOCUS_START.length; i += 1) {
    const winStart = FOCUS_START[i] as number;
    const winEnd = (i + 1 < FOCUS_START.length ? FOCUS_START[i + 1] : FOCUS_END) as number;
    const focused = cardIndex === i ? 1 : FOCUS_DIM;
    if (keyframes.length === 0) {
      keyframes.push(winStart - half);
      values.push(focused);
    }
    keyframes.push(winStart + half, winEnd - half);
    values.push(focused, focused);
  }
  return interpolate(frame, keyframes, values, {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};
