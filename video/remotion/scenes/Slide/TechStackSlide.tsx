import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_IN_OUT, EASE_OUT } from "../../../config/easing";
import {
  MONOSPACE_FONT,
  REGULAR_FONT,
  TITLE_FONT,
} from "../../../config/fonts";
import { SAFE_AREA } from "../../../config/layout";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { blendColor } from "../../helpers/colorBlend";
import { useFadeIn } from "../../helpers/useFadeIn";
import { CountUpNumber } from "../../primitives/CountUpNumber";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import type { TechIconName } from "../../primitives/TechIcon";
import { TechIcon } from "../../primitives/TechIcon";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 6-phase frame budget (60 fps). Sum = 900 = 15 s.
 *   1. 0 – 20     chrome (eyebrow + Miami-red divider via SlideShell)
 *   2. 20 – 50    headline fade-in (spring, EASE_OUT; no typewriter)
 *   3. 50 – 380   diagram assembly. A single continuous side-rail spine draws
 *                 top→bottom over 50 f (starting 20 f before phase-3), framing
 *                 the stack as a ledger rule BEFORE any layer enters. Then the
 *                 4 layers stagger top→down (60 f step), each with a marker
 *                 dot on the spine that fades + scales in as the row lands.
 *                 Icons cascade 6 f per chunk. A single traveling pulse dot
 *                 slides the full height once mid-assembly, replacing the 3
 *                 per-connector pulses the earlier design used. Layer 03
 *                 INTELLIGENCE label pulses ACCENT_COLOR at t = 335 f, and
 *                 its marker dot pulses blue in the same window so label and
 *                 dot read as one unit.
 *   4. 380 – 600  telemetry strip. 5 count-ups stagger in (15 f step). Row 01
 *                 "1,550" transitions to #16A34A (success green) when it
 *                 settles at t ≈ 416 f and a 2 px green hairline draws under.
 *   5. 600 – 700  closer. Serif italic fades in, left-flush at bottom.
 *   6. 700 – 900  hold. Spine shimmers on a 120 f cosine loop for a quiet
 *                 pulse of life through the 3-second tail. */
const PHASES = [20, 30, 330, 220, 100, 200] as const;

type SixPhases = [
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
];

// --- Content ---------------------------------------------------------------
type BrandIconName = Exclude<TechIconName, "chip" | "custom">;
type CustomIconAsset = "openai" | "zustand" | "websocket" | "rag";

type TechChip =
  | { kind: "brand"; name: BrandIconName; label: string }
  | { kind: "custom"; asset: CustomIconAsset; label: string }
  | { kind: "chip"; label: string; title: string };

type LayerRow = {
  counter: string;
  layer: string;
  techs: readonly TechChip[];
  /** INTELLIGENCE — the layer label word pulses ACCENT_COLOR in phase 3. */
  accent?: boolean;
};

const brand = (name: BrandIconName, label: string): TechChip => ({
  kind: "brand",
  name,
  label,
});

/** Hand-authored monochrome glyph (see TechIcon CUSTOM_ICONS). Used for techs
 *  without a `simple-icons` entry: OpenAI, Zustand, WebSocket, RAG. */
const custom = (asset: CustomIconAsset, label: string): TechChip => ({
  kind: "custom",
  asset,
  label,
});

const chip = (label: string, title?: string): TechChip => ({
  kind: "chip",
  label,
  title: title ?? label,
});

const LAYERS: readonly LayerRow[] = [
  {
    counter: "01",
    layer: "EXPERIENCE",
    techs: [
      brand("react", "React 19"),
      custom("zustand", "Zustand"),
      chip("IDE", "Monaco Editor"),
      brand("shadcn", "shadcn/ui"),
      brand("tailwind", "Tailwind"),
    ],
  },
  {
    counter: "02",
    layer: "ORCHESTRATION",
    techs: [
      brand("node", "Node 22"),
      brand("express", "Express 5"),
      brand("postgres", "Postgres + pgvector"),
      custom("websocket", "WebSocket"),
    ],
  },
  {
    counter: "03",
    layer: "INTELLIGENCE",
    techs: [
      custom("openai", "OpenAI"),
      brand("langchain", "LangGraph"),
      brand("mcp", "Model Context Protocol"),
      custom("rag", "Retrieval-Augmented Generation"),
    ],
    accent: true,
  },
  {
    counter: "04",
    layer: "EXECUTION",
    techs: [
      brand("python", "Python 3.11"),
      brand("pytorch", "PyTorch"),
      brand("docker", "Docker sandbox"),
      brand("jupyter", "Jupyter kernel"),
    ],
  },
] as const;

type TelemetryStat = {
  to: number;
  format: (n: number) => string;
  caption: string;
  /** When true, the number flashes green (#16A34A) as it settles. */
  green?: boolean;
};

const TELEMETRY: readonly TelemetryStat[] = [
  {
    to: 1550,
    format: (n) => Math.round(n).toLocaleString(),
    caption: "tests · all green",
    green: true,
  },
  { to: 97, format: (n) => `${Math.round(n)}%`, caption: "coverage" },
  { to: 12000, format: (n) => Math.round(n).toLocaleString(), caption: "LOC typed" },
  { to: 62, format: (n) => `${Math.round(n)}`, caption: "packages" },
  { to: 21, format: (n) => `${Math.round(n)}`, caption: "schema migrations" },
] as const;

// --- Geometry --------------------------------------------------------------
const CONTENT_WIDTH = 1704;
const COUNTER_WIDTH = 56;
const LAYER_LABEL_WIDTH = 240;
const TECH_GAP = 40;
const ICON_SIZE = 26;
const ICON_TEXT_GAP = 10;

/** Row block: more editorial spacing than the original 64/28. Target total
 *  diagram height ~430 px — reads as "composed", not "crowded". */
const LAYER_HEIGHT = 70;
const INTER_ROW_GAP = 50;
const DIAGRAM_ROW_STEP = LAYER_HEIGHT + INTER_ROW_GAP; // 120
const DIAGRAM_HEIGHT =
  LAYERS.length * LAYER_HEIGHT + (LAYERS.length - 1) * INTER_ROW_GAP; // 430
/** Gutter between the side-rail spine (x = 0) and the counter column. Drops
 *  the 01/02/03/04 glyphs into their own column clear of the spine. */
const SPINE_GUTTER = 32;
/** Spine x-center inside the diagram container. A 2-px stroke centered at x=1
 *  spans x ∈ [0, 2], flush to the content column's left edge. */
const SPINE_X = 1;
const SPINE_STROKE_WIDTH = 2;
/** Marker dot radius on the spine. ~5.5 px reads as a confident tick mark —
 *  big enough to register at 1080p, small enough not to dominate the row. */
const MARKER_RADIUS = 5.5;
/** SVG backing width for the spine + markers. Needs to contain the widest
 *  dot (diameter 11) plus a little slack for anti-aliasing. */
const SPINE_SVG_WIDTH = 14;
/** Bottom offset of the telemetry+closer wrapper from SlideShell's absolute
 *  fill. Tightened from 140 → 100 to absorb the +90 px diagram growth while
 *  preserving ≥40 px clearance between the diagram bottom and the strip's
 *  hairline, and leaving the SlideFooter's page number / Miami lockup clear. */
const TELEMETRY_BOTTOM_OFFSET = 100;
/** Extra visual nudge applied only to the closer (via `position: relative`)
 *  so it sits a little lower than its natural flex-column slot, without
 *  dragging the metrics row or affecting the wrapper's layout. */
const CLOSER_NUDGE_DOWN = 24;

// --- Assembly timing (absolute frames inside phase 3) ---------------------
const LAYER_STEP = 60;
const LAYER_TRANSLATE_Y = 12;
const LAYER_SPRING_DAMPING = 200;
const CHUNK_STEP = 6;
const CHUNK_DELAY_AFTER_LAYER = 22;
const CHUNK_TRANSLATE_Y = 6;
/** Spine draw-in: starts at pAssembly.start exactly. 50 f EASE_OUT for a
 *  deliberate ledger-rule gesture — slower than a standard card-enter,
 *  matching the spine's role as the scaffold everything else hangs on. The
 *  first layer's 200-damping spring settles over ~25 f, so the spine is
 *  already visible past the row's y-center before the marker dot pops in. */
const SPINE_DRAW_FRAMES = 50;
/** Traveling pulse dot along the spine: one single pass mid-assembly that
 *  replaces the 3 staggered per-connector pulses the earlier design used.
 *  60 f window, EASE_IN_OUT. Offset from pAssembly.start rather than absolute
 *  so it survives any phase-timing tweaks. */
const TRAVELER_START_OFFSET = 60;
const TRAVELER_FRAMES = 60;
const TRAVELER_FADE_FRAMES = 8;
const TRAVELER_RADIUS = 3.5;
/** Marker dot enter: each dot fades+scales in with a calm 200-damping spring
 *  as its row lands. The spec's "~18 f spring" is achieved via the
 *  default spring settle time plus the 200 damping. */
const MARKER_TRANSLATE_SCALE_FROM = 0.6;
/** INTELLIGENCE word + marker pulse (blue, 30 f EASE_IN_OUT). Unchanged frame
 *  offset so other scenes in the runway that reference this beat stay in sync. */
const PULSE_START = 335;
const PULSE_HALF = 15;
const PULSE_FULL = 30;

// --- Telemetry timing ------------------------------------------------------
const TELEMETRY_STAGGER = 15;
const TELEMETRY_COUNTUP_FRAMES = 36;
const GREEN_FLASH_FRAMES = 18;
const GREEN_UNDERLINE_FRAMES = 30;
const GREEN_UNDERLINE_WIDTH = 180;
const GREEN_HEX = "#16A34A";

// --- Closer timing ---------------------------------------------------------
const CLOSER_DELAY_OFFSET = 8;
/** Frames over which the closer fades in (plain `interpolate`, EASE_OUT). Lands
 *  at exactly opacity 1 — no spring residue left under 1. */
const CLOSER_FADE_FRAMES = 24;

// --- Shimmer (starts at phase 4, continues through hold) ------------------
/** Cosine-loop shimmer on the spine stroke. 120 f = 2 s @ 60 fps. Replaces the
 *  staggered per-connector shimmers the earlier design used — one continuous
 *  pulse of life through the hold. */
const SHIMMER_PERIOD = 120;
const SHIMMER_MIN = 0.45;
const SHIMMER_MAX = 1.0;
/** Frame at which the headline dims to make room for the telemetry strip
 *  as the visual focal point. Matches phase-4 start (pTelemetry.start). */
const HEADLINE_DIM_DURATION = 40;
const HEADLINE_DIMMED_OPACITY = 0.4;

// --- Styles ---------------------------------------------------------------
const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 48,
  letterSpacing: "-0.025em",
  lineHeight: 1.15,
  marginTop: 8,
  marginBottom: 44,
  textWrap: "balance",
};

const COUNTER_STYLE: React.CSSProperties = {
  ...MONOSPACE_FONT,
  fontSize: 20,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.2,
  width: COUNTER_WIDTH,
  flexShrink: 0,
};

const LAYER_LABEL_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontWeight: 700,
  fontSize: 22,
  letterSpacing: "0.06em",
  lineHeight: 1.2,
  width: LAYER_LABEL_WIDTH,
  flexShrink: 0,
  position: "relative",
};

const TECH_LABEL_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 19,
  letterSpacing: "-0.003em",
  lineHeight: 1.2,
};

const TELEMETRY_NUMBER_STYLE: React.CSSProperties = {
  ...MONOSPACE_FONT,
  fontWeight: 700,
  fontSize: 52,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.02em",
  lineHeight: 1,
};

const TELEMETRY_CAPTION_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 14,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  lineHeight: 1.4,
  marginTop: 12,
};

const CLOSER_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 30,
  lineHeight: 1.25,
  letterSpacing: "0em",
  maxWidth: 1100,
};

/**
 * TechStackSlide — circuit-view architecture diagram + telemetry ledger (15 s).
 *
 * Thesis: "Deterministic rigor around a non-deterministic core." Four stacked
 * layer rows (EXPERIENCE → EXECUTION) hang off a single continuous side-rail
 * spine on the left (x = 0, before the counter column). The spine draws
 * top→bottom BEFORE any layer enters, establishing the scaffold; each row
 * then lands with a marker dot on the spine that fades + scales into place.
 * A single traveling pulse dot slides the full height once mid-assembly,
 * replacing the 3 per-connector pulses the earlier design used. Layer 03
 * INTELLIGENCE's label AND its marker dot pulse blue together. A five-cell
 * telemetry strip pins to the bottom safe area, with the first number
 * (`1,550`) crossfading to success green as it settles — the "all green"
 * receipt literally goes green. Brand-colored simple-icons per tech;
 * hand-authored monochrome glyphs fill in where no brand mark exists (OpenAI,
 * Zustand, WebSocket, RAG); the monospace "chip" stands in only for genuinely
 * anonymous labels (Monaco Editor). Red budget untouched beyond the
 * SlideShell header divider; blue accent is used twice — INTELLIGENCE layer
 * pulse + marker + the traveling pulse dot.
 */
export const TechStackSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const [, pHeadline, pAssembly, pTelemetry, pCloser] = useTimeline([
    ...PHASES,
  ]) as SixPhases;
  const c = COLORS[theme];

  // Phase 2 — headline enters via `useFadeIn`, mirroring AgendaSlide. A fade
  // fits the slide's editorial cadence better than a typewriter, and frees
  // 50 f of budget that rolls into phase 3 for a calmer assembly stagger.
  const heading = useFadeIn({ translateY: 8, delay: pHeadline.start });

  // Closer — smooth opacity ramp 0 → 1 via a plain `interpolate` clamped at
  // both ends. Guarantees a clean fade-in that LANDS at full 1.0 (unlike the
  // previous spring, which read as stuck-partial in renders) while still
  // appearing gradually, not hard-snapping.
  const closerOpacity = interpolate(
    frame,
    [pCloser.start + CLOSER_DELAY_OFFSET, pCloser.start + CLOSER_DELAY_OFFSET + CLOSER_FADE_FRAMES],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Headline dims to ~40% once the telemetry strip takes visual priority,
  // preserving the thesis statement as context without competing with the
  // 52-pt count-ups for foreground attention.
  const headlineOpacity = interpolate(
    frame,
    [pTelemetry.start, pTelemetry.start + HEADLINE_DIM_DURATION],
    [1, HEADLINE_DIMMED_OPACITY],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <SlideShell theme={theme} eyebrow="THE STACK" pageNumber="08">
      {/* Phase 2 — headline. Enter fade is multiplied by the phase-4 dim so
          the thesis reads clearly on entry, then steps back once telemetry
          owns the foreground. */}
      <div
        style={{
          ...HEADING_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: heading.opacity * headlineOpacity,
          transform: heading.transform,
        }}
      >
        A probabilistic core inside a deterministic shell.
      </div>

      {/* Phase 3 — architecture diagram. Absolute layout so the side-rail spine
          at x = SPINE_X stays flush to the content column's left edge while the
          counter / label / tech columns sit inboard of SPINE_GUTTER. */}
      <div
        style={{
          position: "relative",
          width: CONTENT_WIDTH,
          height: DIAGRAM_HEIGHT,
        }}
      >
        <StackSpine
          theme={theme}
          layerLandFrames={LAYERS.map((_, i) => pAssembly.start + i * LAYER_STEP)}
          spineDrawStartFrame={pAssembly.start}
          accentIndex={LAYERS.findIndex((r) => r.accent)}
          shimmerStartFrame={pTelemetry.start}
          travelerStartFrame={pAssembly.start + TRAVELER_START_OFFSET}
        />

        {LAYERS.map((row, i) => {
          const layerLandFrame = pAssembly.start + i * LAYER_STEP;
          return (
            <LayerRowCard
              key={row.counter}
              theme={theme}
              row={row}
              landFrame={layerLandFrame}
              top={i * DIAGRAM_ROW_STEP}
            />
          );
        })}
      </div>

      {/* Phases 4+5 — telemetry strip + closer. Anchored to the bottom of the
          canvas (below the SlideShell footer's page-number / Miami lockup)
          so the strip fills what was ~120 px of dead space between the
          diagram and the safe area. Position is absolute to SlideShell's
          <AbsoluteFill> ancestor; left/right match SAFE_AREA.contentLeft /
          SAFE_AREA.right so the band aligns with the rest of the content. */}
      <div
        style={{
          position: "absolute",
          bottom: TELEMETRY_BOTTOM_OFFSET,
          left: SAFE_AREA.contentLeft,
          right: SAFE_AREA.right,
          display: "flex",
          flexDirection: "column",
          gap: 36,
        }}
      >
        <TelemetryStrip theme={theme} startFrame={pTelemetry.start} />

        {/* Relative-positioned + top offset so the closer visually sits a bit
            lower than its natural flex slot, without touching the metrics row
            or the wrapper layout. */}
        <div
          style={{
            ...CLOSER_STYLE,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: closerOpacity,
            textAlign: "center",
            whiteSpace: "nowrap",
            maxWidth: "none",
            position: "relative",
            top: CLOSER_NUDGE_DOWN,
          }}
        >
          We didn&rsquo;t automate the 80%. We made it{" "}
          <span style={{ color: c.ACCENT_COLOR }}>auditable</span>.
        </div>
      </div>
    </SlideShell>
  );
};
// ---------------------------------------------------------------------------
// StackSpine — single continuous side-rail hairline + 4 marker dots. Replaces
// the 3 inter-layer DiagramConnector segments the earlier design used. All
// motion is a pure function of `frame`, so the spine is fully seekable.
//
// Timing contract:
//   • Spine draws top→bottom over SPINE_DRAW_FRAMES starting at
//     `spineDrawStartFrame` (20 f BEFORE phase-3 begins, so the structural
//     rule is visible before any row enters).
//   • Each marker dot fades + scales in when its row lands (`layerLandFrames[i]`),
//     with a calm 200-damping spring.
//   • INTELLIGENCE's marker cross-fades to ACCENT_COLOR during the PULSE
//     window — in sync with the label pulse inside LayerRowCard.
//   • After pTelemetry.start, the stroke shimmers on a 120-f cosine loop
//     (0.45 → 1 → 0.45).
//   • One traveling pulse dot slides top→bottom once at `travelerStartFrame`.
// ---------------------------------------------------------------------------
const StackSpine: React.FC<{
  theme: Theme;
  /** Absolute frame at which each layer lands — one entry per marker dot. */
  layerLandFrames: readonly number[];
  /** Absolute frame at which the spine starts drawing. */
  spineDrawStartFrame: number;
  /** Index of the accent-blue layer (INTELLIGENCE). -1 disables the pulse. */
  accentIndex: number;
  /** Absolute frame at which the continuous stroke shimmer begins. */
  shimmerStartFrame: number;
  /** Absolute frame at which the single traveling pulse dot begins its run. */
  travelerStartFrame: number;
}> = ({
  theme,
  layerLandFrames,
  spineDrawStartFrame,
  accentIndex,
  shimmerStartFrame,
  travelerStartFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = COLORS[theme];

  // Marker y-positions: vertical center of each layer row.
  const markerYs = layerLandFrames.map(
    (_, i) => i * DIAGRAM_ROW_STEP + LAYER_HEIGHT / 2,
  );

  // Spine draw-in: dashoffset goes length → 0 across the draw window. Same
  // trick as DiagramConnector / MotionLine, factored inline for this slide.
  const drawProgress = interpolate(
    frame,
    [spineDrawStartFrame, spineDrawStartFrame + SPINE_DRAW_FRAMES],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const dashoffset = (1 - drawProgress) * DIAGRAM_HEIGHT;

  // Shimmer: cosine loop on stroke opacity after phase-4 start. Inert before.
  let strokeOpacity = 1;
  if (frame >= shimmerStartFrame) {
    const t = (frame - shimmerStartFrame) % SHIMMER_PERIOD;
    const phase = (t / SHIMMER_PERIOD) * Math.PI * 2;
    const norm = (Math.cos(phase) + 1) / 2;
    strokeOpacity = SHIMMER_MIN + (SHIMMER_MAX - SHIMMER_MIN) * norm;
  }

  // Per-marker fade+scale spring. Hook loop is stable across renders because
  // `layerLandFrames.length` is a compile-time constant (= LAYERS.length).
  const markerProgress = layerLandFrames.map((land) =>
    spring({
      fps,
      frame,
      config: { damping: 200 },
      delay: land,
    }),
  );

  // INTELLIGENCE marker color pulse — same easing + window as the label pulse
  // inside LayerRowCard so the two blue flashes fire in lockstep.
  const accentPulse =
    accentIndex >= 0
      ? interpolate(
          frame,
          [PULSE_START, PULSE_START + PULSE_HALF, PULSE_START + PULSE_FULL],
          [0, 1, 0],
          {
            easing: EASE_IN_OUT,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )
      : 0;

  // Traveling pulse dot: one pass top→bottom inside [start, start + frames].
  // Fades in over the first TRAVELER_FADE_FRAMES, holds, fades out the last.
  const travelerEnd = travelerStartFrame + TRAVELER_FRAMES;
  let traveler: { cy: number; opacity: number } | null = null;
  if (frame >= travelerStartFrame && frame <= travelerEnd) {
    const cy = interpolate(
      frame,
      [travelerStartFrame, travelerEnd],
      [0, DIAGRAM_HEIGHT],
      {
        easing: EASE_IN_OUT,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
    const fadeIn = interpolate(
      frame,
      [travelerStartFrame, travelerStartFrame + TRAVELER_FADE_FRAMES],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const fadeOut = interpolate(
      frame,
      [travelerEnd - TRAVELER_FADE_FRAMES, travelerEnd],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    traveler = { cy, opacity: Math.min(fadeIn, fadeOut) };
  }

  return (
    <svg
      width={SPINE_SVG_WIDTH}
      height={DIAGRAM_HEIGHT}
      viewBox={`0 0 ${SPINE_SVG_WIDTH} ${DIAGRAM_HEIGHT}`}
      style={{
        position: "absolute",
        top: 0,
        left: SPINE_X - SPINE_SVG_WIDTH / 2,
        overflow: "visible",
      }}
    >
      <line
        x1={SPINE_SVG_WIDTH / 2}
        y1={0}
        x2={SPINE_SVG_WIDTH / 2}
        y2={DIAGRAM_HEIGHT}
        stroke={c.WORD_COLOR_ON_BG_APPEARED}
        strokeWidth={SPINE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray={DIAGRAM_HEIGHT}
        strokeDashoffset={dashoffset}
        opacity={strokeOpacity}
      />

      {markerYs.map((cy, i) => {
        const p = markerProgress[i] as number;
        if (p <= 0) return null;
        const scale =
          MARKER_TRANSLATE_SCALE_FROM +
          (1 - MARKER_TRANSLATE_SCALE_FROM) * p;
        const fill =
          i === accentIndex && accentPulse > 0
            ? blendColor(
                c.WORD_COLOR_ON_BG_APPEARED,
                c.ACCENT_COLOR,
                accentPulse,
              )
            : c.WORD_COLOR_ON_BG_APPEARED;
        return (
          <circle
            key={`marker-${i}`}
            cx={SPINE_SVG_WIDTH / 2}
            cy={cy}
            r={MARKER_RADIUS * scale}
            fill={fill}
            opacity={p}
          />
        );
      })}

      {traveler !== null ? (
        <circle
          cx={SPINE_SVG_WIDTH / 2}
          cy={traveler.cy}
          r={TRAVELER_RADIUS}
          fill={c.WORD_COLOR_ON_BG_APPEARED}
          opacity={traveler.opacity * 0.65}
        />
      ) : null}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// LayerRowCard — one layer's counter + label + icon-plus-label chunks.
// ---------------------------------------------------------------------------
const LayerRowCard: React.FC<{
  theme: Theme;
  row: LayerRow;
  landFrame: number;
  top: number;
}> = ({ theme, row, landFrame, top }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  // Layer-row enter — opacity + translateY spring, 200 damping matches SPRING_UI.
  const rowEnter = useFadeIn({
    translateY: LAYER_TRANSLATE_Y,
    damping: LAYER_SPRING_DAMPING,
    delay: landFrame,
  });

  // Tech chunks cascade 6 f apart, starting 22 f after the row lands.
  const chunks = useStaggeredFadeIn(row.techs.length, {
    step: CHUNK_STEP,
    startDelay: landFrame + CHUNK_DELAY_AFTER_LAYER,
    translateY: CHUNK_TRANSLATE_Y,
    damping: 200,
  });

  // INTELLIGENCE label pulse — stacked span cross-fades to ACCENT_COLOR.
  const pulseOpacity = row.accent
    ? interpolate(
        frame,
        [PULSE_START, PULSE_START + PULSE_HALF, PULSE_START + PULSE_FULL],
        [0, 1, 0],
        {
          easing: EASE_IN_OUT,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: SPINE_GUTTER,
        width: CONTENT_WIDTH - SPINE_GUTTER,
        height: LAYER_HEIGHT,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        opacity: rowEnter.opacity,
        transform: rowEnter.transform,
      }}
    >
      <div style={{ ...COUNTER_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
        {row.counter}
      </div>

      <div style={{ ...LAYER_LABEL_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
        <span>{row.layer}</span>
        {row.accent ? (
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
            {row.layer}
          </span>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          columnGap: TECH_GAP,
          flexWrap: "nowrap",
          overflow: "hidden",
        }}
      >
        {row.techs.map((tech, chunkIdx) => {
          const chunk = chunks[chunkIdx] as StaggeredItem;
          const iconDelay = landFrame + CHUNK_DELAY_AFTER_LAYER + chunkIdx * CHUNK_STEP;
          return (
            <div
              key={`${row.counter}-${chunkIdx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: ICON_TEXT_GAP,
                opacity: chunk.opacity,
                transform: chunk.transform,
              }}
            >
              {tech.kind === "brand" ? (
                <TechIcon
                  name={tech.name}
                  size={ICON_SIZE}
                  tone="brand"
                  delay={iconDelay}
                />
              ) : tech.kind === "custom" ? (
                <TechIcon
                  name="custom"
                  asset={tech.asset}
                  title={tech.label}
                  size={ICON_SIZE}
                  tone="mono"
                  delay={iconDelay}
                  style={{ color: c.WORD_COLOR_ON_BG_APPEARED }}
                />
              ) : (
                <TechIcon
                  name="chip"
                  label={tech.label}
                  title={tech.title}
                  size={ICON_SIZE}
                  tone="mono"
                  delay={iconDelay}
                  style={{ color: c.WORD_COLOR_ON_BG_GREYED }}
                />
              )}
              <span
                style={{
                  ...TECH_LABEL_STYLE,
                  color: c.WORD_COLOR_ON_BG_APPEARED,
                }}
              >
                {tech.kind === "chip" ? tech.title : tech.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// TelemetryStrip — 5 count-ups in a horizontal band. Column 0 ("1,550 tests")
// crossfades to success green as the number settles, with a 2 px green hair-
// line drawing underneath. The remaining four stay neutral.
// ---------------------------------------------------------------------------
const TelemetryStrip: React.FC<{ theme: Theme; startFrame: number }> = ({
  theme,
  startFrame,
}) => {
  const c = COLORS[theme];
  const columnWidth = Math.floor(CONTENT_WIDTH / TELEMETRY.length);

  // Top hairline that separates the diagram from the strip; draws with the
  // first count-up so the band reads as one unit.
  return (
    <div style={{ position: "relative" }}>
      <MotionLine
        x1={0}
        y1={0}
        x2={CONTENT_WIDTH}
        y2={0}
        delay={startFrame - 20}
        durationInFrames={36}
        color={c.BORDER_COLOR}
        strokeWidth={1}
        svgWidth={CONTENT_WIDTH}
        svgHeight={2}
        style={{ position: "absolute", top: -16, left: 0 }}
      />
      <div style={{ display: "flex", flexDirection: "row" }}>
        {TELEMETRY.map((stat, i) => (
          <TelemetryCell
            key={stat.caption}
            theme={theme}
            stat={stat}
            columnWidth={columnWidth}
            delay={startFrame + i * TELEMETRY_STAGGER}
          />
        ))}
      </div>
    </div>
  );
};

const TelemetryCell: React.FC<{
  theme: Theme;
  stat: TelemetryStat;
  columnWidth: number;
  delay: number;
}> = ({ theme, stat, columnWidth, delay }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];
  const settleFrame = delay + TELEMETRY_COUNTUP_FRAMES;

  // Whole-cell gate: the cell stays invisible until ~4 f before its count-up
  // starts, then fades up with a small translateY just as the digits begin to
  // tick. Without this, `CountUpNumber` renders `format(0)` ("0" / "0%") from
  // frame 0 onward and the telemetry strip bleeds through the diagram's
  // entrance as a row of zeros at the bottom of the slide.
  const cellFadeIn = useFadeIn({
    delay: delay - 4,
    translateY: 4,
    damping: 200,
  });

  // Green flash: color eases from neutral ink → #16A34A starting when the
  // count-up settles. Pure interpolation; no spring overshoot on color.
  const greenProgress = stat.green
    ? interpolate(
        frame,
        [settleFrame, settleFrame + GREEN_FLASH_FRAMES],
        [0, 1],
        { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 0;
  const numberColor = stat.green
    ? blendColor(c.WORD_COLOR_ON_BG_APPEARED, GREEN_HEX, greenProgress)
    : c.WORD_COLOR_ON_BG_APPEARED;

  const captionFade = useFadeIn({
    translateY: 4,
    damping: 200,
    delay: settleFrame - 10,
  });

  return (
    <div
      style={{
        width: columnWidth,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        paddingRight: 16,
        position: "relative",
        opacity: cellFadeIn.opacity,
        transform: cellFadeIn.transform,
      }}
    >
      {/* Number in a relative-positioned box so the green underline anchors
       *  to the number's baseline box, not a hard-coded pixel offset. */}
      <div
        style={{
          ...TELEMETRY_NUMBER_STYLE,
          color: numberColor,
          position: "relative",
        }}
      >
        <CountUpNumber
          from={0}
          to={stat.to}
          format={stat.format}
          delay={delay}
          durationInFrames={TELEMETRY_COUNTUP_FRAMES}
        />
        {stat.green ? (
          <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6 }}>
            <MotionLine
              x1={0}
              y1={0}
              x2={GREEN_UNDERLINE_WIDTH}
              y2={0}
              delay={settleFrame + 2}
              durationInFrames={GREEN_UNDERLINE_FRAMES}
              color={GREEN_HEX}
              strokeWidth={2}
              svgWidth={GREEN_UNDERLINE_WIDTH}
              svgHeight={2}
            />
          </div>
        ) : null}
      </div>

      <div
        style={{
          ...TELEMETRY_CAPTION_STYLE,
          color: stat.green
            ? blendColor(c.WORD_COLOR_ON_BG_GREYED, GREEN_HEX, greenProgress)
            : c.WORD_COLOR_ON_BG_GREYED,
          opacity: captionFade.opacity,
          transform: captionFade.transform,
        }}
      >
        {stat.caption}
      </div>
    </div>
  );
};
