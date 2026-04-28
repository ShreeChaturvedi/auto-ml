import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN_OUT } from "../../../config/easing";
import { REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { GraphNode } from "../../primitives/GraphNode";
import { MotionLine } from "../../primitives/MotionLine";
import { NodeHaloRing } from "../../primitives/NodeHaloRing";
import { SlideShell } from "../../primitives/SlideShell";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 6-phase frame budget (60fps). Sum = 1620 = 27s.
 *   1. 0–20       eyebrow + heading + hero gradient bloom
 *   2. 20–180     8 chapter rows fade-stagger (15f, translateY 16) +
 *                 vertical station rail draws in over 48f
 *   3. 180–240    column divider draws in (MotionLine, EASE_OUT)
 *   4. 240–480    right heading fades; 3 proofs reveal with 40f stagger,
 *                 each preceded by a 48px arrow MotionLine (30f draw) and
 *                 a fade-in italic tagline 20f after the proof text
 *   5. 480–540    accent chapter station pulses once in ACCENT_COLOR
 *   6. 540–1620   hold */
const PHASES = [20, 160, 60, 240, 60, 1080] as const;

type SixPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];

// --- Content type ---------------------------------------------------------
export type ChapterEntry = {
  title: string;
  timestamp: string;
  accent?: boolean;
};

/** Keep in sync with DEFAULT_CHAPTERS in Root.tsx. Timestamps default to
 *  "TBD" until the final voiceover cut locks the running times. */
const FALLBACK_CHAPTERS: readonly ChapterEntry[] = [
  { title: "Upload & Project Planning", timestamp: "TBD" },
  { title: "Data Exploration — EDA + Natural-Language SQL", timestamp: "TBD" },
  { title: "Preprocessing — the LangGraph finite state machine", timestamp: "TBD", accent: true },
  { title: "Feature Engineering", timestamp: "TBD" },
  { title: "Training — sandboxed Docker notebooks", timestamp: "TBD" },
  { title: "Experiments & Leaderboard", timestamp: "TBD" },
  { title: "What's Next", timestamp: "TBD" },
  { title: "Architecture — one graph, three phases", timestamp: "TBD" },
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

/** A right-column promise: declarative statement + serif tagline epigraph. */
type Proof = { text: string; tagline: string };

const PROOFS: readonly Proof[] = [
  {
    text: "That humans can stay in the loop without losing pace.",
    tagline: "— human judgment, machine pace.",
  },
  {
    text: "That agentic ML pipelines can be observed, not just executed.",
    tagline: "— every decision, on the record.",
  },
  {
    text: "That one platform can carry the whole workflow, end-to-end.",
    tagline: "— upload to leaderboard, one loop.",
  },
] as const;

// --- Geometry -------------------------------------------------------------
// Usable width inside SlideShell = 1920 - contentLeft(120) - right(96) = 1704.
// Split 60/38 with 32px gap: 1024 + 32 + 648 = 1704.
const LEFT_COL_WIDTH = 1024;
const RIGHT_COL_WIDTH = 648;
const COL_GAP = 32;
const DIVIDER_HEIGHT = 600;
const DIVIDER_DRAW_FRAMES = 48;

const ROW_HEIGHT = 72;
const ROW_GAP = 8;
const CHAPTER_STAGGER = 15;
const ROW_TRANSLATE_Y = 16;

// Station rail — vertical MotionLine pinned to the inside-left of the
// chapter column; circular stations sit on it, titles inset to its right.
const STATION_SIZE = 32;
const RAIL_X = STATION_SIZE / 2;
const RAIL_DRAW_FRAMES = 48;
const TITLE_INSET = STATION_SIZE + 24;

const RIGHT_HEADER_FADE_DURATION = 30;
const PROOF_STAGGER = 40;
// Arrow grew 16 → 48 so the proof rows read as a declarative ledger.
const PROOF_ARROW_SIZE = 48;
const PROOF_ARROW_DRAW = 30;
const TAGLINE_DELAY_AFTER_PROOF = 20;

/** Phase 5 — accent station pulse (60f total, ease-in-out peak at 510). */
const PULSE = [480, 510, 540] as const;
const PULSE_HALO_DURATION = 60;

// --- Styles ---------------------------------------------------------------
const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT, fontSize: 48, letterSpacing: "-0.025em", lineHeight: 1.15,
  marginTop: 8, marginBottom: 48, textWrap: "balance",
};

const ROW_TITLE_STYLE: React.CSSProperties = {
  ...TITLE_FONT, fontWeight: 600, fontSize: 28, letterSpacing: "-0.015em",
  lineHeight: 1.2, flex: 1, minWidth: 0, paddingRight: 16,
};

const RIGHT_HEADER_STYLE: React.CSSProperties = {
  ...TITLE_FONT, fontWeight: 700, fontSize: 20, letterSpacing: "0.02em",
  textTransform: "uppercase", lineHeight: 1.2, marginBottom: 32,
};

const PROOF_TEXT_STYLE: React.CSSProperties = {
  ...TITLE_FONT, fontWeight: 500, fontSize: 24, letterSpacing: "-0.01em",
  lineHeight: 1.4, maxWidth: 600,
};

// Indent so the tagline sits under the proof text, not under the arrow.
const TAGLINE_STYLE: React.CSSProperties = {
  ...SERIF_FONT, fontStyle: "italic", fontSize: 18, lineHeight: 1.4,
  marginTop: 6, paddingLeft: PROOF_ARROW_SIZE + 16,
};

/**
 * AgendaSlide — eight-chapter road-map with proof overlay (27s / 1620f).
 *
 * Data-driven via `scene.meta.chapters`. Defaults live in `Root.tsx`.
 *
 * The chapter list reads as a vertical station rail (MotionLine + circular
 * GraphNode stations). The accent chapter (`accent: true`) is punched once in
 * phase 5 by a NodeHaloRing in ACCENT_COLOR. Until the voiceover cut locks
 * timestamps, each row renders a dashed `— : —` pill instead of a real time.
 */
export const AgendaSlide: React.FC<SlideBodyProps> = ({ theme, meta }) => {
  const [, pRows, pDivider, pRight] = useTimeline([...PHASES]) as SixPhases;
  const c = COLORS[theme];

  const chapters = parseChapters(meta);
  const accentIndex = chapters.findIndex((ch) => ch.accent === true);

  // Rail height grows with the chapter list. Trim the trailing gap so the
  // rail terminates flush with the last row rather than dangling below it.
  const railHeight = Math.max(0, chapters.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP);
  const gridMinHeight = Math.max(railHeight, DIVIDER_HEIGHT);

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

  // Vertical center of station `i` on the rail (rows use `alignItems: center`).
  const stationCenterY = (i: number) => i * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2;

  return (
    <SlideShell theme={theme} eyebrow="AGENDA" gradient={true} pageNumber="07">
      {/* Phase 1 — heading. */}
      <div
        style={{
          ...HEADING_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: heading.opacity,
          transform: heading.transform,
        }}
      >
        The next twenty minutes, mapped.
      </div>

      {/* Two-column grid: chapter list (with rail) | divider | proofs. */}
      <div
        style={{
          position: "relative",
          display: "flex",
          gap: COL_GAP,
          alignItems: "flex-start",
          width: LEFT_COL_WIDTH + COL_GAP + RIGHT_COL_WIDTH,
          minHeight: gridMinHeight,
        }}
      >
        {/* Left column — vertical station rail + chapter rows. */}
        <div
          style={{
            position: "relative",
            width: LEFT_COL_WIDTH,
            flexShrink: 0,
            minHeight: railHeight,
          }}
        >
          {/* Phase 2 — vertical rail drawn top→bottom in lockstep with the
              first chapter's fade-in. RAIL_X aligns it with station centers. */}
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: STATION_SIZE, height: railHeight, pointerEvents: "none",
            }}
          >
            <MotionLine
              x1={RAIL_X}
              y1={0}
              x2={RAIL_X}
              y2={railHeight}
              delay={pRows.start}
              durationInFrames={RAIL_DRAW_FRAMES}
              color={c.BORDER_COLOR}
              svgWidth={STATION_SIZE}
              svgHeight={railHeight}
              strokeWidth={2}
            />
          </div>

          {/* Stations layer — circular GraphNodes anchored to the rail. */}
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: STATION_SIZE, height: railHeight, pointerEvents: "none",
            }}
          >
            {chapters.map((chapter, i) => {
              const stationFade = rows[i] as StaggeredItem;
              return (
                <div
                  key={`station-${i}-${chapter.title}`}
                  style={{
                    position: "absolute", left: 0,
                    top: stationCenterY(i) - STATION_SIZE / 2,
                    width: STATION_SIZE, height: STATION_SIZE,
                    opacity: stationFade.opacity, transform: stationFade.transform,
                  }}
                >
                  <GraphNode
                    x={0} y={0} w={STATION_SIZE} h={STATION_SIZE}
                    radius={STATION_SIZE / 2}
                    tier="deterministic" status="idle"
                    background={c.BACKGROUND_ELEVATED}
                    borderColor={c.WORD_COLOR_ON_BG_APPEARED}
                    textColor={c.WORD_COLOR_ON_BG_APPEARED}
                    enterFrame={pRows.start + i * CHAPTER_STAGGER}
                  >
                    <div
                      style={{
                        ...REGULAR_FONT, fontWeight: 600, fontSize: 14,
                        lineHeight: 1, fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {String(i + 1)}
                    </div>
                  </GraphNode>
                </div>
              );
            })}

            {/* Phase 5 — accent station pulse; halo peak coincides with the
                title cross-fade peak (frame 510). */}
            {accentIndex >= 0 ? (
              <NodeHaloRing
                x={0} y={stationCenterY(accentIndex) - STATION_SIZE / 2}
                w={STATION_SIZE} h={STATION_SIZE} radius={STATION_SIZE / 2}
                at={PULSE[0]} durationFrames={PULSE_HALO_DURATION}
                color={c.ACCENT_COLOR}
              />
            ) : null}
          </div>

          {/* Chapter rows — title + timestamp pill. Station owns the number. */}
          <div style={{ paddingLeft: TITLE_INSET }}>
            {chapters.map((chapter, i) => (
              <ChapterRow
                key={`row-${i}-${chapter.title}`}
                theme={theme}
                chapter={chapter}
                enter={rows[i] as StaggeredItem}
              />
            ))}
          </div>
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

        {/* Right column — "The goal" + 3 proofs. */}
        <div style={{ width: RIGHT_COL_WIDTH, flexShrink: 0 }}>
          <div
            style={{
              ...RIGHT_HEADER_STYLE,
              color: c.WORD_COLOR_ON_BG_GREYED,
              opacity: rightHeader.opacity,
              transform: rightHeader.transform,
            }}
          >
            The goal
          </div>
          {PROOFS.map((proof, i) => (
            <ProofRow
              key={proof.text}
              theme={theme}
              proof={proof}
              delay={pRight.start + RIGHT_HEADER_FADE_DURATION + i * PROOF_STAGGER}
            />
          ))}
        </div>
      </div>
    </SlideShell>
  );
};

/** A single chapter row: title (with optional accent pulse) + timestamp pill.
 *  The station number lives on the rail layer above, so this component only
 *  owns the row's prose. Titles marked `accent` cross-fade an ACCENT_COLOR
 *  span over the neutral title (0 → 1 → 0 across 60f) so the swap reads as a
 *  gentle breath rather than a hard color flip. */
const ChapterRow: React.FC<{
  theme: Theme;
  chapter: ChapterEntry;
  enter: StaggeredItem;
}> = ({ theme, chapter, enter }) => {
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
        alignItems: "center",
        height: ROW_HEIGHT,
        marginBottom: ROW_GAP,
        opacity: enter.opacity,
        transform: enter.transform,
      }}
    >
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
      {/* Timeline markers removed per presenter-mode design — the deck is
       *  narrated live, so dashed "— : —" slots added visual noise without
       *  conveying any information. `chapter.timestamp` is still carried on
       *  the data type so the MP4 build can reintroduce live timestamps
       *  later by restoring a TimestampSlot render here. */}
    </div>
  );
};


/** A single proof row — 48px arrow MotionLine + proof text + an italic serif
 *  tagline fading in 20f later so the epigraph reads as a follow-up. */
const ProofRow: React.FC<{ theme: Theme; proof: Proof; delay: number }> = ({
  theme, proof, delay,
}) => {
  const c = COLORS[theme];
  const fade = useFadeIn({ translateY: 6, delay });
  const taglineFade = useFadeIn({ translateY: 4, delay: delay + TAGLINE_DELAY_AFTER_PROOF });

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex", alignItems: "baseline", gap: 16,
          opacity: fade.opacity, transform: fade.transform,
        }}
      >
        <div
          style={{
            flexShrink: 0, width: PROOF_ARROW_SIZE, height: PROOF_ARROW_SIZE,
            // Nudge to optical-align with the text baseline.
            transform: "translateY(-8px)",
          }}
        >
          <MotionLine
            x1={0} y1={PROOF_ARROW_SIZE / 2}
            x2={PROOF_ARROW_SIZE} y2={PROOF_ARROW_SIZE / 2}
            delay={delay} durationInFrames={PROOF_ARROW_DRAW}
            color={c.WORD_COLOR_ON_BG_GREYED}
            svgWidth={PROOF_ARROW_SIZE} svgHeight={PROOF_ARROW_SIZE}
            strokeWidth={1.5}
          />
        </div>
        <div style={{ ...PROOF_TEXT_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
          {proof.text}
        </div>
      </div>
      <div
        style={{
          ...TAGLINE_STYLE, color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: taglineFade.opacity, transform: taglineFade.transform,
        }}
      >
        {proof.tagline}
      </div>
    </div>
  );
};
