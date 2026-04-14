import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 6-phase frame budget (60fps). Sum = 1620 = 27s.
 *   1. 0–20       eyebrow + heading + hero gradient bloom
 *   2. 20–180     7 chapter rows fade-stagger (15f, translateY 16)
 *   3. 180–240    column divider draws in (MotionLine, EASE_OUT)
 *   4. 240–480    right heading fades; 3 proofs reveal with 40f stagger,
 *                 each preceded by a 16px arrow MotionLine (30f draw)
 *   5. 480–540    chapter 3 (accent: true) pulses once in ACCENT_COLOR
 *   6. 540–1620   hold */
const PHASES = [20, 160, 60, 240, 60, 1080] as const;

type SixPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];

// --- Content type ---------------------------------------------------------
export type ChapterEntry = {
  title: string;
  timestamp: string;
  accent?: boolean;
};

/** Keep in sync with DEFAULT_CHAPTERS in Root.tsx. Used only if meta.chapters
 *  is missing or malformed — normal path reads from scene.meta. */
const FALLBACK_CHAPTERS: readonly ChapterEntry[] = [
  { title: "Upload & Project Planning", timestamp: "02:05" },
  { title: "Data Exploration — EDA + Natural-Language SQL", timestamp: "04:40" },
  { title: "Preprocessing — the LangGraph finite state machine", timestamp: "08:10", accent: true },
  { title: "Feature Engineering", timestamp: "12:05" },
  { title: "Training — sandboxed Docker notebooks", timestamp: "14:20" },
  { title: "Experiments & Leaderboard", timestamp: "17:05" },
  { title: "What's Next", timestamp: "19:40" },
] as const;

/** Runtime type-guard for meta.chapters. Because `meta` is
 *  `Record<string, unknown>`, we cannot trust the payload without filtering. */
const parseChapters = (meta: SlideBodyProps["meta"]): readonly ChapterEntry[] => {
  const raw = (meta as { chapters?: unknown } | undefined)?.chapters;
  if (!Array.isArray(raw)) return FALLBACK_CHAPTERS;
  const parsed = raw.filter((item): item is ChapterEntry => {
    if (typeof item !== "object" || item === null) return false;
    const candidate = item as Partial<ChapterEntry>;
    return (
      typeof candidate.title === "string" &&
      typeof candidate.timestamp === "string"
    );
  });
  return parsed.length > 0 ? parsed : FALLBACK_CHAPTERS;
};

const PROOFS = [
  "That humans can stay in the loop without losing pace.",
  "That agentic ML pipelines can be observed, not just executed.",
  "That one platform can carry the whole workflow, end-to-end.",
] as const;

// --- Geometry -------------------------------------------------------------
// Usable width inside SlideShell = 1920 - contentLeft(120) - right(96) = 1704.
// Split 60/38 with 32px gap: 1024 + 32 + 648 = 1704.
const LEFT_COL_WIDTH = 1024;
const RIGHT_COL_WIDTH = 648;
const COL_GAP = 32;
const GRID_MIN_HEIGHT = 640;
const DIVIDER_HEIGHT = 600;
const DIVIDER_DRAW_FRAMES = 48;

const ROW_HEIGHT = 72;
const ROW_GAP = 8;
const CHAPTER_STAGGER = 15;
const ROW_TRANSLATE_Y = 16;

const RIGHT_HEADER_FADE_DURATION = 30;
const PROOF_STAGGER = 40;
const PROOF_ARROW_SIZE = 16;
const PROOF_ARROW_DRAW = 30;

/** Phase 5 — chapter 3 accent pulse (60f total, ease-in-out peak at 510). */
const PULSE = [480, 510, 540] as const;

// --- Styles ---------------------------------------------------------------
const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 48,
  letterSpacing: "-0.025em",
  lineHeight: 1.15,
  marginTop: 8,
  marginBottom: 48,
  textWrap: "balance",
};

const ROW_NUMBER_STYLE: React.CSSProperties = {
  ...REGULAR_FONT, fontWeight: 500, fontSize: 20, lineHeight: 1.2, width: 32, flexShrink: 0,
};

const ROW_TITLE_STYLE: React.CSSProperties = {
  ...TITLE_FONT, fontWeight: 600, fontSize: 28, letterSpacing: "-0.015em",
  lineHeight: 1.2, flex: 1, minWidth: 0, paddingRight: 16,
};

const ROW_TIMESTAMP_STYLE: React.CSSProperties = {
  ...MONOSPACE_FONT, fontSize: 18, fontVariantNumeric: "tabular-nums",
  lineHeight: 1.2, textAlign: "right", flexShrink: 0,
};

const RIGHT_HEADER_STYLE: React.CSSProperties = {
  ...TITLE_FONT, fontWeight: 700, fontSize: 20, letterSpacing: "0.02em",
  textTransform: "uppercase", lineHeight: 1.2, marginBottom: 32,
};

const PROOF_TEXT_STYLE: React.CSSProperties = {
  ...REGULAR_FONT, fontWeight: 500, fontSize: 22, lineHeight: 1.4, maxWidth: 600,
};

const GRID_STYLE: React.CSSProperties = {
  position: "relative", display: "flex", gap: COL_GAP, alignItems: "flex-start",
  width: LEFT_COL_WIDTH + COL_GAP + RIGHT_COL_WIDTH, minHeight: GRID_MIN_HEIGHT,
};

/**
 * AgendaSlide — seven-chapter road-map with proof overlay (27s / 1620f).
 *
 * Data-driven via `scene.meta.chapters`. Defaults live in `Root.tsx`.
 *
 * Sole accent-color element: chapter 3's title pulses once in ACCENT_COLOR
 * during phase 5. The column divider is the grid element (left spine is
 * intentionally omitted on this slide to avoid parallel verticals).
 */
export const AgendaSlide: React.FC<SlideBodyProps> = ({ theme, meta }) => {
  const [, pRows, pDivider, pRight] = useTimeline([...PHASES]) as SixPhases;
  const c = COLORS[theme];

  const chapters = parseChapters(meta);

  // Phase 1 — heading fade-in.
  const heading = useFadeIn({ translateY: 8, delay: 0 });

  // Phase 2 — chapter rows stagger-fade.
  const rows = useStaggeredFadeIn(chapters.length, {
    step: CHAPTER_STAGGER,
    startDelay: pRows.start,
    translateY: ROW_TRANSLATE_Y,
    damping: 200,
  });

  // Phase 4 — right-column heading fade. Starts at phase 4 start.
  const rightHeader = useFadeIn({
    translateY: 6,
    delay: pRight.start,
    durationInFrames: RIGHT_HEADER_FADE_DURATION,
  });

  return (
    <SlideShell theme={theme} eyebrow="AGENDA" spine={false} gradient={true}>
      {/* Phase 1 — heading. */}
      <div
        style={{
          ...HEADING_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: heading.opacity,
          transform: heading.transform,
        }}
      >
        The next twenty minutes.
      </div>

      {/* Two-column grid: chapter list | vertical divider | proofs. */}
      <div style={GRID_STYLE}>
        {/* Left column — chapter list. */}
        <div style={{ width: LEFT_COL_WIDTH, flexShrink: 0 }}>
          {chapters.map((chapter, i) => (
            <ChapterRow
              key={`${i}-${chapter.timestamp}`}
              theme={theme}
              index={i}
              chapter={chapter}
              enter={rows[i] as StaggeredItem}
            />
          ))}
        </div>

        {/* Phase 3 — vertical column divider. Positioned inside the flex gap. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: LEFT_COL_WIDTH + COL_GAP / 2,
            height: DIVIDER_HEIGHT,
            pointerEvents: "none",
          }}
        >
          <MotionLine
            x1={0}
            y1={0}
            x2={0}
            y2={DIVIDER_HEIGHT}
            delay={pDivider.start}
            durationInFrames={DIVIDER_DRAW_FRAMES}
            color={c.BORDER_COLOR}
            svgWidth={2}
            svgHeight={DIVIDER_HEIGHT}
          />
        </div>

        {/* Right column — "What this video will prove" + 3 proofs. */}
        <div style={{ width: RIGHT_COL_WIDTH, flexShrink: 0 }}>
          <div
            style={{
              ...RIGHT_HEADER_STYLE,
              color: c.WORD_COLOR_ON_BG_GREYED,
              opacity: rightHeader.opacity,
              transform: rightHeader.transform,
            }}
          >
            What this video will prove
          </div>
          {PROOFS.map((text, i) => (
            <ProofRow
              key={text}
              theme={theme}
              text={text}
              delay={pRight.start + RIGHT_HEADER_FADE_DURATION + i * PROOF_STAGGER}
            />
          ))}
        </div>
      </div>
    </SlideShell>
  );
};

/** A single chapter row: number | title | timestamp. Titles marked `accent`
 *  receive a phase-5 pulse — a stacked ACCENT_COLOR span cross-fades over the
 *  neutral title (0 → 1 → 0 across 60f) so the swap reads as a gentle breath
 *  rather than a hard color flip. */
const ChapterRow: React.FC<{
  theme: Theme;
  index: number;
  chapter: ChapterEntry;
  enter: StaggeredItem;
}> = ({ theme, index, chapter, enter }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  // Phase 5 — accent pulse (0 → 1 → 0 across 60f). Only non-zero on rows
  // marked `accent: true`; EASE_IN_OUT so the peak is held briefly.
  const pulseOpacity = chapter.accent
    ? interpolate(frame, [...PULSE], [0, 1, 0], {
        easing: EASE_IN_OUT,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        height: ROW_HEIGHT,
        marginBottom: ROW_GAP,
        opacity: enter.opacity,
        transform: enter.transform,
      }}
    >
      <div style={{ ...ROW_NUMBER_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
        {index + 1}.
      </div>
      <div
        style={{
          ...ROW_TITLE_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          position: "relative",
        }}
      >
        <span>{chapter.title}</span>
        {chapter.accent ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              color: c.ACCENT_COLOR,
              opacity: pulseOpacity,
              pointerEvents: "none",
            }}
          >
            {chapter.title}
          </span>
        ) : null}
      </div>
      <div style={{ ...ROW_TIMESTAMP_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
        {chapter.timestamp}
      </div>
    </div>
  );
};

/** A single proof row: animated 16px arrow MotionLine + proof text. The arrow
 *  draws over 30f (EASE_OUT) starting at `delay`; the text fades in alongside.
 *  Arrow and text share a single fade-in delay so the eye lands on them
 *  together — the arrow just animates its stroke in addition. */
const ProofRow: React.FC<{
  theme: Theme;
  text: string;
  delay: number;
}> = ({ theme, text, delay }) => {
  const c = COLORS[theme];
  const fade = useFadeIn({ translateY: 6, delay });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        marginBottom: 24,
        opacity: fade.opacity,
        transform: fade.transform,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: PROOF_ARROW_SIZE,
          height: PROOF_ARROW_SIZE,
          // Nudge to optical-align with text baseline — the line is mid-height.
          transform: "translateY(-6px)",
        }}
      >
        <MotionLine
          x1={0}
          y1={PROOF_ARROW_SIZE / 2}
          x2={PROOF_ARROW_SIZE}
          y2={PROOF_ARROW_SIZE / 2}
          delay={delay}
          durationInFrames={PROOF_ARROW_DRAW}
          color={c.WORD_COLOR_ON_BG_GREYED}
          svgWidth={PROOF_ARROW_SIZE}
          svgHeight={PROOF_ARROW_SIZE}
        />
      </div>
      <div style={{ ...PROOF_TEXT_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
        {text}
      </div>
    </div>
  );
};
