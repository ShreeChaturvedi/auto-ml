import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ARCH_PALETTE } from "../../../config/arch-layout";
import { EASE_IN_OUT, EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { DiagramConnector } from "../../primitives/DiagramConnector";
import { GraphNode } from "../../primitives/GraphNode";
import { MaskReveal } from "../../primitives/MaskReveal";
import { MotionLine } from "../../primitives/MotionLine";
import { BreathingHaloRing } from "../../primitives/NodeHaloRing";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 8-phase frame budget (60fps). Sum = 1440 = 24s.
 *   1. 0–20      eyebrow + heading
 *   2. 20–80     axis draws left→right + dotted secondary baseline draws
 *   3. 80–380    4 markers on 75f beat (80/155/230/305): tick + dot + year + supporting
 *                  + breathing halo rings on each marker
 *   4. 380–440   2026 "easy 20%" single pulse (opacity 1→0.3→1, 30f EASE_IN_OUT)
 *   5. 440–600   timeline translates up 120px; two lanes of GraphNodes stagger in
 *   6. 600–1200  vertical "GAP" connector draws + label fades in
 *   7. 1200–1380 italic serif header above lanes + closing serif fade
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
const SUPPORT_MAX_WIDTH = 320;
const SECONDARY_AXIS_OFFSET = 6;
const SECONDARY_AXIS_DELAY = 20;
const SECONDARY_AXIS_DURATION = 48;
const HALO_PAD = 14;

// --- Phase-4 pulse for "easy 20%" -------------------------------------------
const PULSE_START = 395;
const PULSE_DURATION = 30;

// --- Phase-5 timeline lift + lane stagger -----------------------------------
const TIMELINE_LIFT_PX = 120;

// --- Diagram (lane) geometry ------------------------------------------------
const DIAGRAM_WIDTH = 1440;
/** Container vertical anchor — pulled up from the original 55% so the 200px
 *  vertical gap connector + both lanes + italic header all fit above the
 *  closing serif without crowding. */
const DIAGRAM_TOP_PCT = 47;

const LEFT_NODE_W = 180;
const LEFT_NODE_H = 52;
const LEFT_NODE_GAP = 16;
const LEFT_LANE_LINE_WIDTH = 680;
const LEFT_LANE_LINE_DRAW = 56;
const LEFT_STAGGER_STEP = 12;
const LEFT_STAGGER_DELAY = 40;

const RIGHT_NODE_W = 160;
const RIGHT_NODE_H = 48;
const RIGHT_NODE_GAP = 16;
const RIGHT_LANE_LINE_DRAW = 56;
const RIGHT_STAGGER_STEP = 12;
/** Right lane begins 30f after the left lane (per spec). */
const RIGHT_STAGGER_DELAY = LEFT_STAGGER_DELAY + 30;

const LANE_LINE_TO_NODES_GAP = 16;
const TOP_LANE_TO_CONNECTOR_GAP = 8;
const CONNECTOR_TO_BOTTOM_LANE_GAP = 8;
const HEADER_TO_TOP_LANE_GAP = 18;

// --- Vertical gap connector --------------------------------------------------
const CONNECTOR_HEIGHT = 200;
const CONNECTOR_DRAW_FRAMES = 48;
const CONNECTOR_SVG_WIDTH = 24;
const GAP_LABEL_DELAY_AFTER_CONNECTOR = 20;
const GAP_LABEL_FADE_FRAMES = 18;

// --- Phase 7 — italic serif header + closing serif --------------------------
const HEADER_DELAY_OFFSET = 0;
const CLOSING_DELAY_OFFSET = 24;

// --- Timeline markers -------------------------------------------------------
type TimelineMarker = {
  year: string;
  /** x-offset along the 1440px axis (evenly spaced regardless of year gap). */
  x: number;
  supporting: string;
  /** True on the 2026 inflection marker — dot + the inline "easy 20%" phrase
   *  carry ACCENT_COLOR, and the breathing halo runs louder. */
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

const LEFT_PANEL_ITEMS = [
  "model search",
  "hyperparameter tuning",
  "train/test split",
  "metric evaluation",
] as const;

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
  fontSize: 52,
  letterSpacing: "-0.025em",
  lineHeight: 1.15,
  maxWidth: 1500,
  marginTop: 8,
  marginBottom: 40,
  textWrap: "balance",
};

const YEAR_LABEL_STYLE: React.CSSProperties = {
  ...MONOSPACE_FONT,
  fontSize: 24,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.1,
  textAlign: "center",
};

const SUPPORT_LINE_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontSize: 20,
  lineHeight: 1.4,
  textAlign: "center",
  maxWidth: SUPPORT_MAX_WIDTH,
};

const LANE_HEADER_STYLE: React.CSSProperties = {
  ...SERIF_FONT,
  fontSize: 36,
  lineHeight: 1.2,
  letterSpacing: "0em",
  textAlign: "center",
  textWrap: "balance",
};

const GAP_LABEL_STYLE: React.CSSProperties = {
  ...MONOSPACE_FONT,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

// Lane pill label — matches the `<span>` pattern used inside ProblemTrio's
// Panel1 / Panel3 GraphNodes. GraphNode's default label (22px uppercase bold)
// overflows these 160-180 px pills; the `children` slot is the documented
// escape hatch for non-arch consumers that need tighter typography.
const LANE_PILL_LABEL_STYLE: React.CSSProperties = {
  ...MONOSPACE_FONT,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  lineHeight: 1.15,
  textAlign: "center",
  padding: "0 10px",
  textWrap: "balance",
};

/**
 * WhyNowSlide — industry timeline to the 2026 inflection point (24s / 1440f).
 *
 * Sole accent colorants: the 2026 dot + breathing halo, the inline
 * "easy 20%" phrase on the 2026 supporting line, and the closing italic.
 * The "gap" diagram below uses ARCH_PALETTE.redFlash for the vertical
 * connector + GAP label (incomplete-work semantic) — INSTITUTIONAL.MIAMI_RED
 * is reserved for chrome.
 */
export const WhyNowSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const [
    ,
    pAxis,
    ,
    pPulse,
    pLift,
    pGap,
    pClose,
  ] = useTimeline([...PHASES]) as EightPhases;
  const c = COLORS[theme];

  // Phase 5 — timeline lifts up 120px while lane nodes rise. Progress runs the
  // full lift window, then holds at the lifted position for the rest of the slide.
  const liftProgress = interpolate(
    frame,
    [pLift.start, pLift.end],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const liftY = interpolate(liftProgress, [0, 1], [0, -TIMELINE_LIFT_PX]);

  // Phase 5 — lane node entry frames. GraphNode runs its own spring on
  // `enterFrame`, so we just compute the per-index start frame here (left lane
  // staggers across LEFT_STAGGER_STEP frames; right lane offsets 30f after).
  const leftLaneStart = pLift.start + LEFT_STAGGER_DELAY;
  const rightLaneStart = pLift.start + RIGHT_STAGGER_DELAY;

  // Phase 1 — slide title fades in (canonical useFadeIn — no typewriter).
  const titleFade = useFadeIn({
    translateY: 8,
    damping: 200,
    delay: 0,
  });

  // Phase 7 — italic serif header above the lanes fades in.
  const headerFade = useFadeIn({
    translateY: 8,
    delay: pClose.start + HEADER_DELAY_OFFSET,
  });

  // Phase 7 — closing serif line fades in alongside the header.
  const closingFade = useFadeIn({
    translateY: 8,
    delay: pClose.start + CLOSING_DELAY_OFFSET,
  });

  // GAP label fades in 20f after the connector finishes drawing.
  const gapLabelStart =
    pGap.start + CONNECTOR_DRAW_FRAMES + GAP_LABEL_DELAY_AFTER_CONNECTOR;
  const gapLabelOpacity = interpolate(
    frame,
    [gapLabelStart, gapLabelStart + GAP_LABEL_FADE_FRAMES],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Lane horizontal centering math (within DIAGRAM_WIDTH).
  const leftLaneWidth =
    LEFT_PANEL_ITEMS.length * LEFT_NODE_W +
    (LEFT_PANEL_ITEMS.length - 1) * LEFT_NODE_GAP;
  const leftLaneStartX = (DIAGRAM_WIDTH - leftLaneWidth) / 2;
  const rightLaneWidth =
    RIGHT_PANEL_ITEMS.length * RIGHT_NODE_W +
    (RIGHT_PANEL_ITEMS.length - 1) * RIGHT_NODE_GAP;
  const rightLaneStartX = (DIAGRAM_WIDTH - rightLaneWidth) / 2;
  const rightLaneLineWidth = rightLaneWidth + 24;

  // Vertical layout offsets within the diagram container.
  const headerHeight = 52;
  const topLaneTop = headerHeight + HEADER_TO_TOP_LANE_GAP;
  const topLaneNodeTop = topLaneTop + LANE_LINE_TO_NODES_GAP;
  const topLaneBottom = topLaneNodeTop + LEFT_NODE_H;
  const connectorTop = topLaneBottom + TOP_LANE_TO_CONNECTOR_GAP;
  const connectorBottom = connectorTop + CONNECTOR_HEIGHT;
  const bottomLaneLineTop = connectorBottom + CONNECTOR_TO_BOTTOM_LANE_GAP;
  const bottomLaneNodeTop = bottomLaneLineTop + LANE_LINE_TO_NODES_GAP;
  const diagramHeight = bottomLaneNodeTop + RIGHT_NODE_H;

  return (
    <SlideShell theme={theme} eyebrow="WHY NOW" pageNumber="06">
      {/* Phase 1 — heading. */}
      <div
        style={{
          ...HEADING_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: titleFade.opacity,
          transform: titleFade.transform,
        }}
      >
        The tools have caught up with the ambition.
      </div>

      {/* Phases 2–4 — timeline container. Lifts -120px across phase 5. */}
      <div
        style={{
          position: "relative",
          width: AXIS_WIDTH,
          margin: "0 auto",
          transform: `translateY(${liftY}px)`,
        }}
      >
        {/* Primary axis — drawn left→right over 48f in phase 2. */}
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

        {/* Secondary dotted baseline — masked sweep so only this hairline
         *  is revealed (a sweep over the whole timeline row would re-mask the
         *  year labels typed in during phase 3). */}
        <div
          style={{
            position: "absolute",
            top: AXIS_Y + SECONDARY_AXIS_OFFSET,
            left: 0,
            width: AXIS_WIDTH,
            height: 2,
          }}
        >
          <MaskReveal
            delay={pAxis.start + AXIS_DRAW_FRAMES + SECONDARY_AXIS_DELAY}
            durationInFrames={SECONDARY_AXIS_DURATION}
          >
            <svg
              width={AXIS_WIDTH}
              height={2}
              viewBox={`0 0 ${AXIS_WIDTH} 2`}
              style={{ overflow: "visible" }}
            >
              <line
                x1={0}
                y1={1}
                x2={AXIS_WIDTH}
                y2={1}
                stroke={c.BORDER_COLOR}
                strokeWidth={1}
                strokeDasharray="3 5"
              />
            </svg>
          </MaskReveal>
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

      {/* Phases 5+ — comparison diagram. Two stacked lanes split by a
       *  vertical "GAP" connector. Replaces the previous two-card layout. */}
      <div
        style={{
          position: "absolute",
          top: `${DIAGRAM_TOP_PCT}%`,
          left: "50%",
          transform: "translateX(-50%)",
          width: DIAGRAM_WIDTH,
          height: diagramHeight,
        }}
      >
        {/* Phase 7 — italic serif flanking the gap connector. Both labels sit
         *  at the connector's vertical midpoint so they bracket the GAP marker:
         *  past-state on the left, present-action on the right. */}
        <div
          style={{
            position: "absolute",
            top: connectorTop + CONNECTOR_HEIGHT / 2,
            left: 0,
            width: DIAGRAM_WIDTH / 2 - CONNECTOR_SVG_WIDTH / 2 - 60,
            display: "flex",
            justifyContent: "flex-end",
            opacity: headerFade.opacity,
            transform: `translateY(-50%) ${headerFade.transform}`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              ...LANE_HEADER_STYLE,
              color: c.WORD_COLOR_ON_BG_APPEARED,
              textAlign: "right",
              maxWidth: 360,
            }}
          >
            Previous tools stopped here.
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            top: connectorTop + CONNECTOR_HEIGHT / 2,
            left: DIAGRAM_WIDTH / 2 + CONNECTOR_SVG_WIDTH / 2 + 60,
            width: DIAGRAM_WIDTH / 2 - CONNECTOR_SVG_WIDTH / 2 - 60,
            display: "flex",
            justifyContent: "flex-start",
            opacity: closingFade.opacity,
            transform: `translateY(-50%) ${closingFade.transform}`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              ...LANE_HEADER_STYLE,
              color: c.WORD_COLOR_ON_BG_APPEARED,
              textAlign: "left",
              maxWidth: 360,
            }}
          >
            Our agent picks up the rest.
          </div>
        </div>

        {/* Top lane — overhead "assembly line" + 4 deterministic-style nodes. */}
        <div
          style={{
            position: "absolute",
            top: topLaneTop,
            left: (DIAGRAM_WIDTH - LEFT_LANE_LINE_WIDTH) / 2,
            width: LEFT_LANE_LINE_WIDTH,
          }}
        >
          <MotionLine
            x1={0}
            y1={0}
            x2={LEFT_LANE_LINE_WIDTH}
            y2={0}
            delay={pLift.start}
            durationInFrames={LEFT_LANE_LINE_DRAW}
            color={c.WORD_COLOR_ON_BG_APPEARED}
            strokeWidth={1.5}
            svgWidth={LEFT_LANE_LINE_WIDTH}
            svgHeight={2}
          />
        </div>
        {LEFT_PANEL_ITEMS.map((label, i) => (
          <GraphNode
            key={label}
            x={leftLaneStartX + i * (LEFT_NODE_W + LEFT_NODE_GAP)}
            y={topLaneNodeTop}
            w={LEFT_NODE_W}
            h={LEFT_NODE_H}
            tier="deterministic"
            status="success"
            background={c.BACKGROUND_ELEVATED}
            borderColor={c.WORD_COLOR_ON_BG_APPEARED}
            textColor={c.WORD_COLOR_ON_BG_APPEARED}
            enterFrame={leftLaneStart + i * LEFT_STAGGER_STEP}
          >
            <span style={LANE_PILL_LABEL_STYLE}>{label}</span>
          </GraphNode>
        ))}

        {/* Vertical gap connector + GAP label (phase 6). */}
        <div
          style={{
            position: "absolute",
            top: connectorTop,
            left: DIAGRAM_WIDTH / 2 - CONNECTOR_SVG_WIDTH / 2,
            width: CONNECTOR_SVG_WIDTH,
            height: CONNECTOR_HEIGHT,
          }}
        >
          <DiagramConnector
            height={CONNECTOR_HEIGHT}
            drawStartFrame={pGap.start}
            drawDurationFrames={CONNECTOR_DRAW_FRAMES}
            strokeColor={ARCH_PALETTE.redFlash}
            strokeWidth={2}
            svgWidth={CONNECTOR_SVG_WIDTH}
          />
        </div>
        {/* GAP label — sibling of the connector, centered on its midpoint. */}
        <div
          style={{
            position: "absolute",
            top: connectorTop + CONNECTOR_HEIGHT / 2,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            opacity: gapLabelOpacity,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              ...GAP_LABEL_STYLE,
              color: ARCH_PALETTE.redFlash,
              background: c.BACKGROUND,
              padding: "6px 14px",
              transform: "translateY(-50%)",
            }}
          >
            GAP
          </div>
        </div>

        {/* Bottom lane — dashed overhead line + 6 llm-delegated-style nodes. */}
        <div
          style={{
            position: "absolute",
            top: bottomLaneLineTop,
            left: (DIAGRAM_WIDTH - rightLaneLineWidth) / 2,
            width: rightLaneLineWidth,
            height: 2,
          }}
        >
          <DashedDrawLine
            width={rightLaneLineWidth}
            color={c.WORD_COLOR_ON_BG_GREYED}
            delay={pLift.start + 30}
            durationInFrames={RIGHT_LANE_LINE_DRAW}
          />
        </div>
        {RIGHT_PANEL_ITEMS.map((label, i) => (
          <GraphNode
            key={label}
            x={rightLaneStartX + i * (RIGHT_NODE_W + RIGHT_NODE_GAP)}
            y={bottomLaneNodeTop}
            w={RIGHT_NODE_W}
            h={RIGHT_NODE_H}
            tier="llm_delegated"
            status="idle"
            background={c.BACKGROUND_ELEVATED}
            borderColor={c.WORD_COLOR_ON_BG_GREYED}
            textColor={c.WORD_COLOR_ON_BG_GREYED}
            innerRing={false}
            enterFrame={rightLaneStart + i * RIGHT_STAGGER_STEP}
          >
            <span style={LANE_PILL_LABEL_STYLE}>{label}</span>
          </GraphNode>
        ))}
      </div>

    </SlideShell>
  );
};

/** One timeline beat: vertical tick (drawn) + dot (scale-in) + Monaspace year
 *  label (typed) + supporting line (faded) + a continuous BreathingHaloRing
 *  around the dot. The 2026 variant renders the inline "easy 20%" pulse in
 *  Phase 4 via `Accent2026Supporting` and breathes louder. */
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
  const haloColor = marker.accent ? c.ACCENT_COLOR : c.WORD_COLOR_ON_BG_GREYED;
  const haloMaxOpacity = marker.accent ? 0.45 : 0.2;
  const haloMinOpacity = 0.1;

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

      {/* Continuous breathing halo wrapping the dot — louder for 2026.
       *  Gated until the dot finishes scaling in: BreathingHaloRing holds at
       *  minOpacity (0.1) while frame < at, which would cause a faint ring to
       *  appear under the slide title before the marker beats arrive. */}
      {pulseFrame >= beatStart + MARKER_IN_FRAMES ? (
        <BreathingHaloRing
          x={marker.x - DOT_RADIUS - HALO_PAD}
          y={AXIS_Y - DOT_RADIUS - HALO_PAD}
          w={DOT_RADIUS * 2 + HALO_PAD * 2}
          h={DOT_RADIUS * 2 + HALO_PAD * 2}
          radius={DOT_RADIUS + HALO_PAD}
          at={beatStart + MARKER_IN_FRAMES}
          color={haloColor}
          minOpacity={haloMinOpacity}
          maxOpacity={haloMaxOpacity}
          strokeWidth={1.5}
        />
      ) : null}

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
          top: AXIS_Y - TICK_HEIGHT - 36,
          left: marker.x - 60,
          width: 120,
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
          top: AXIS_Y + 28,
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

/** Dashed horizontal line that draws left→right over `durationInFrames`,
 *  matching MotionLine's strokeDashoffset technique but with an overlaid dash
 *  pattern. MotionLine itself doesn't expose a strokeDasharray prop — keeping
 *  this slide-local rather than reaching outside the scene file. */
const DashedDrawLine: React.FC<{
  width: number;
  color: string;
  delay: number;
  durationInFrames: number;
}> = ({ width, color, delay, durationInFrames }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(
    frame,
    [delay, delay + durationInFrames],
    [0, 1],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const visibleWidth = progress * width;
  return (
    <svg
      width={width}
      height={2}
      viewBox={`0 0 ${width} 2`}
      style={{ overflow: "visible" }}
    >
      <line
        x1={0}
        y1={1}
        x2={visibleWidth}
        y2={1}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="6 6"
      />
    </svg>
  );
};
