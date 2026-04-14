import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { MotionLine } from "../../primitives/MotionLine";
import { ScaleInNumber } from "../../primitives/ScaleInNumber";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, READING_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

// -----------------------------------------------------------------------------
// Frame budget (60fps). Sum = 2040 = 34s.
// -----------------------------------------------------------------------------
//   1. 0–20       eyebrow + header divider settle
//   2. 20–110     heading types in (neutral color — no inline accent)
//   3. 110–200    panels stagger-fade (15f each)
//   4. 200–260    panel headlines type + body fades 0→60%→100%
//   5. 260–300    panel internal hairlines draw
//   6. 300–600    Panel 1 focus window (300f) — tool-fragmentation strip
//   7. 600–1020   Panel 2 focus window (420f) — skill-stack bars + 1.5 hero
//   8. 1020–1560  Panel 3 focus window (540f) — approval-gate reveal
//   9. 1560–2040  tail hold — all panels return to opacity 1 (480f)
const PHASES = [20, 90, 90, 60, 40, 300, 420, 540, 480] as const;

type NinePhases = [
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
];
type ThreePanels = [StaggeredItem, StaggeredItem, StaggeredItem];

// -----------------------------------------------------------------------------
// Panel + layout geometry
// -----------------------------------------------------------------------------
const PANEL_WIDTH = 552;
const PANEL_HEIGHT = 640;
const PANEL_GAP = 24;
const PANEL_PADDING = 40;
const PANEL_RADIUS = 8;
const PANEL_SHADOW = "0 2px 12px rgba(0, 0, 0, 0.04)";
const PANEL_BORDER = "rgba(0, 0, 0, 0.10)";

const PANEL_TEXT_HEIGHT = 260;
// Hairline separator sits between the top text region and the bottom visual.
const PANEL_SEPARATOR_Y = PANEL_TEXT_HEIGHT;
const PANEL_VISUAL_HEIGHT = PANEL_HEIGHT - PANEL_TEXT_HEIGHT - 1; // 1px hairline

const PANEL_STAGGER = 15;
const PANEL_TRANSLATE_Y = 24;
const PANEL_SCALE_FROM = 0.985;

// -----------------------------------------------------------------------------
// Focus-shift geometry — absolute frames
// -----------------------------------------------------------------------------
const FOCUS_DIM = 0.4;
const FOCUS_CROSSFADE_FRAMES = 20;
const FOCUS_START = [300, 600, 1020] as const;
const FOCUS_END = 1560;

// -----------------------------------------------------------------------------
// Copy
// -----------------------------------------------------------------------------
const HEADING = "A modern ML workflow lives in six different tools.";

type Panel = {
  headline: string;
  body: string;
};

const PANELS: readonly [Panel, Panel, Panel] = [
  {
    headline: "Six tools. Six mental models.",
    body: "Jupyter for exploration, dbt for SQL, Python for preprocessing, scikit-learn for training, MLflow for tracking, Streamlit for demo.",
  },
  {
    headline: "Five specialties, one hire.",
    body: "SQL, Python, statistics, containers, MLOps — rarely in the same person.",
  },
  {
    headline: "AutoML hides the decisions that matter.",
    body: "Which rows to drop. How to encode categoricals. When to regularize. Production teams need those decisions on the record.",
  },
] as const;

// -----------------------------------------------------------------------------
// Style tokens
// -----------------------------------------------------------------------------
const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 48,
  letterSpacing: "-0.025em",
  lineHeight: 1.15,
  maxWidth: 1500,
  marginTop: 8,
  marginBottom: 32,
  textWrap: "balance",
};
const PANELS_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: PANEL_GAP,
  alignItems: "flex-start",
};
const PANEL_HEADLINE_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 28,
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
  minHeight: 68,
};
const PANEL_BODY_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontSize: 18,
  lineHeight: 1.5,
  marginTop: 18,
  // Force every panel's body region to occupy the same vertical space so the
  // three text regions land their bottom edges at the same y regardless of
  // whether the copy actually wraps to 2 or 3 lines. 3 lines × 1.5 em = 4.5 em.
  minHeight: "4.5em",
};

// -----------------------------------------------------------------------------
// ProblemTrioSlide — three bespoke visuals (34s / 2040f).
// -----------------------------------------------------------------------------
export const ProblemTrioSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const [
    ,
    pHeading,
    pStagger,
    pCopy,
    pHairline,
    // pFocus1 / pFocus2 / pFocus3 / pTail — referenced via FOCUS_START below.
  ] = useTimeline([...PHASES]) as NinePhases;
  const c = COLORS[theme];

  const panels = useStaggeredFadeIn(PANELS.length, {
    step: PANEL_STAGGER,
    startDelay: pStagger.start,
    translateY: PANEL_TRANSLATE_Y,
    damping: 200,
  }) as ThreePanels;

  return (
    <SlideShell theme={theme} eyebrow="THE PROBLEM" pageNumber="05 / 07">
      {/* Phase 2 — heading types in as a single neutral block. */}
      <div style={{ ...HEADING_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
        <TypeOnText
          text={HEADING}
          rate={READING_RATE}
          delay={pHeading.start}
          caret={false}
        />
      </div>

      {/* Phases 3–9 — three panels, each text-top + visual-bottom. */}
      <div style={PANELS_ROW_STYLE}>
        {PANELS.map((panel, i) => (
          <PanelShell
            key={panel.headline}
            frame={frame}
            index={i}
            theme={theme}
            panel={panel}
            enter={panels[i] as StaggeredItem}
            copyStart={pCopy.start + i * 8}
            hairlineStart={pHairline.start + i * 10}
          />
        ))}
      </div>
    </SlideShell>
  );
};

// -----------------------------------------------------------------------------
// PanelShell — outer card, text region on top, hairline, visual below.
// -----------------------------------------------------------------------------
const PanelShell: React.FC<{
  frame: number;
  index: number;
  theme: Theme;
  panel: Panel;
  enter: StaggeredItem;
  copyStart: number;
  hairlineStart: number;
}> = ({ frame, index, theme, panel, enter, copyStart, hairlineStart }) => {
  const c = COLORS[theme];
  const focusOpacity = focusOpacityAt(frame, index);
  const scale = interpolate(enter.progress, [0, 1], [PANEL_SCALE_FROM, 1]);
  const bodyStart = copyStart + 40;
  const bodyReveal = interpolate(
    frame,
    [copyStart, bodyStart, bodyStart + 30],
    [0, 0.6, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const focusStart = FOCUS_START[index]!;

  return (
    <div
      style={{
        position: "relative",
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        borderRadius: PANEL_RADIUS,
        background: c.BACKGROUND_ELEVATED,
        border: `1px solid ${PANEL_BORDER}`,
        boxShadow: PANEL_SHADOW,
        opacity: enter.opacity * focusOpacity,
        transform: `translateY(${enter.translateY}px) scale(${scale})`,
        overflow: "hidden",
      }}
    >
      {/* Top text region — headline + body. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: PANEL_TEXT_HEIGHT,
          padding: PANEL_PADDING,
          boxSizing: "border-box",
        }}
      >
        <div style={{ ...PANEL_HEADLINE_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
          <TypeOnText
            text={panel.headline}
            rate={LABEL_RATE}
            delay={copyStart}
            caret={false}
          />
        </div>
        <div
          style={{
            ...PANEL_BODY_STYLE,
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: bodyReveal,
          }}
        >
          {panel.body}
        </div>
      </div>

      {/* Internal hairline separator — drawn during phase 5. */}
      <div
        style={{
          position: "absolute",
          top: PANEL_SEPARATOR_Y,
          left: PANEL_PADDING,
          right: PANEL_PADDING,
          pointerEvents: "none",
        }}
      >
        <MotionLine
          x1={0}
          y1={0}
          x2={PANEL_WIDTH - PANEL_PADDING * 2}
          y2={0}
          delay={hairlineStart}
          durationInFrames={30}
          color={c.BORDER_COLOR}
          svgWidth={PANEL_WIDTH - PANEL_PADDING * 2}
          svgHeight={2}
        />
      </div>

      {/* Bottom visual region. */}
      <div
        style={{
          position: "absolute",
          top: PANEL_SEPARATOR_Y + 1,
          left: 0,
          right: 0,
          height: PANEL_VISUAL_HEIGHT,
          padding: PANEL_PADDING,
          boxSizing: "border-box",
        }}
      >
        {index === 0 ? (
          <ToolFragmentationVisual theme={theme} focusStart={focusStart} />
        ) : index === 1 ? (
          <SkillStackVisual theme={theme} focusStart={focusStart} />
        ) : (
          <ApprovalGateVisual theme={theme} focusStart={focusStart} />
        )}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Panel 1 visual — tool-fragmentation strip.
// Six labeled tiles connected by 28px MotionLine arrows. Tiles stagger-fade
// in (15f each) starting at focusStart; each arrow draws 20f AFTER its left
// tile lands (5f offset). Micro-stat fades in at the end.
// -----------------------------------------------------------------------------
const TOOL_TILES: readonly string[] = [
  "jupyter",
  "dbt",
  "pandas",
  "sklearn",
  "mlflow",
  "streamlit",
] as const;
const TOOL_TILE_WIDTH = 62;
const TOOL_TILE_HEIGHT = 52;
const TOOL_TILE_GAP = 18; // arrow length between tiles
const TOOL_TILE_STAGGER = 15;
const TOOL_TILE_FADE_FRAMES = 18;
const TOOL_ARROW_DRAW_FRAMES = 20;
const TOOL_ARROW_OFFSET = 5; // frames after tile settles before arrow draws
/** Total strip width: 6×62 + 5×18 = 462. Fits inside 552 − 80 = 472 with 10px margin. */
const TOOL_STRIP_WIDTH =
  TOOL_TILES.length * TOOL_TILE_WIDTH + (TOOL_TILES.length - 1) * TOOL_TILE_GAP;

const ToolFragmentationVisual: React.FC<{
  theme: Theme;
  focusStart: number;
}> = ({ theme, focusStart }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  // Stat fades in after the last arrow is drawn.
  const lastTileLanded =
    focusStart + (TOOL_TILES.length - 1) * TOOL_TILE_STAGGER + TOOL_TILE_FADE_FRAMES;
  const lastArrowDone = lastTileLanded + TOOL_ARROW_OFFSET + TOOL_ARROW_DRAW_FRAMES;
  const statOpacity = interpolate(
    frame,
    [lastArrowDone + 10, lastArrowDone + 40],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
      }}
    >
      <div
        style={{
          position: "relative",
          width: TOOL_STRIP_WIDTH,
          height: TOOL_TILE_HEIGHT,
        }}
      >
        {TOOL_TILES.map((label, i) => {
          const tileStart = focusStart + i * TOOL_TILE_STAGGER;
          const tileOpacity = interpolate(
            frame,
            [tileStart, tileStart + TOOL_TILE_FADE_FRAMES],
            [0, 1],
            { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const tileTranslate = interpolate(
            frame,
            [tileStart, tileStart + TOOL_TILE_FADE_FRAMES],
            [4, 0],
            { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const x = i * (TOOL_TILE_WIDTH + TOOL_TILE_GAP);
          return (
            <div
              key={label}
              style={{
                position: "absolute",
                left: x,
                top: 0,
                width: TOOL_TILE_WIDTH,
                height: TOOL_TILE_HEIGHT,
                borderRadius: 6,
                border: `1px solid ${c.BORDER_COLOR}`,
                background: c.BACKGROUND_ELEVATED,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: tileOpacity,
                transform: `translateY(${tileTranslate}px)`,
                ...MONOSPACE_FONT,
                fontSize: 13,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
                color: c.WORD_COLOR_ON_BG_APPEARED,
              }}
            >
              {label}
            </div>
          );
        })}

        {TOOL_TILES.slice(0, -1).map((label, i) => {
          const tileStart = focusStart + i * TOOL_TILE_STAGGER;
          const arrowDelay = tileStart + TOOL_TILE_FADE_FRAMES + TOOL_ARROW_OFFSET;
          const arrowX = (i + 1) * TOOL_TILE_WIDTH + i * TOOL_TILE_GAP;
          return (
            <div
              key={`arrow-${label}`}
              style={{
                position: "absolute",
                left: arrowX,
                top: TOOL_TILE_HEIGHT / 2 - 1,
                width: TOOL_TILE_GAP,
                height: 2,
                pointerEvents: "none",
              }}
            >
              <MotionLine
                x1={0}
                y1={0}
                x2={TOOL_TILE_GAP}
                y2={0}
                delay={arrowDelay}
                durationInFrames={TOOL_ARROW_DRAW_FRAMES}
                color={c.WORD_COLOR_ON_BG_GREYED}
                strokeWidth={1.25}
                svgWidth={TOOL_TILE_GAP}
                svgHeight={2}
              />
            </div>
          );
        })}
      </div>

      <div
        style={{
          ...MONOSPACE_FONT,
          fontSize: 16,
          fontVariantNumeric: "tabular-nums",
          color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: statOpacity,
          letterSpacing: "0.02em",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <span>
          <span style={{ color: c.WORD_COLOR_ON_BG_APPEARED, fontWeight: 600 }}>4</span>
          {" languages"}
        </span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span>
          <span style={{ color: c.WORD_COLOR_ON_BG_APPEARED, fontWeight: 600 }}>11</span>
          {" context switches / hr"}
        </span>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Panel 2 visual — skill-stack bar chart.
// Five bars drawing left→right (15f EASE_OUT, 10f stagger). After the bars
// complete, `1.5` hero ScaleInNumber fires with SPRING_HERO. Caption fades in
// 20f later.
// -----------------------------------------------------------------------------
type SkillRow = { label: string; fill: number };

const SKILL_ROWS: readonly SkillRow[] = [
  { label: "SQL", fill: 0.7 },
  { label: "Python", fill: 0.8 },
  { label: "statistics", fill: 0.55 },
  { label: "containers", fill: 0.3 },
  { label: "MLOps", fill: 0.25 },
] as const;

const SKILL_LABEL_WIDTH = 110;
const SKILL_LABEL_GAP = 16;
const SKILL_TRACK_WIDTH = 260;
const SKILL_TRACK_HEIGHT = 14;
const SKILL_ROW_GAP = 12;
const SKILL_BAR_DRAW_FRAMES = 15;
const SKILL_BAR_STAGGER = 10;

const SkillStackVisual: React.FC<{
  theme: Theme;
  focusStart: number;
}> = ({ theme, focusStart }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const barsComplete =
    focusStart + (SKILL_ROWS.length - 1) * SKILL_BAR_STAGGER + SKILL_BAR_DRAW_FRAMES;
  const heroDelay = barsComplete + 10;
  const captionDelay = heroDelay + 24 + 20;
  const captionOpacity = interpolate(
    frame,
    [captionDelay, captionDelay + 20],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
      }}
    >
      {/* Left column — five skill bars. */}
      <div style={{ display: "flex", flexDirection: "column", gap: SKILL_ROW_GAP }}>
        {SKILL_ROWS.map((row, i) => {
          const barStart = focusStart + i * SKILL_BAR_STAGGER;
          const fillProgress = interpolate(
            frame,
            [barStart, barStart + SKILL_BAR_DRAW_FRAMES],
            [0, 1],
            { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const fillWidth = SKILL_TRACK_WIDTH * row.fill * fillProgress;
          return (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: SKILL_LABEL_GAP,
              }}
            >
              <div
                style={{
                  ...REGULAR_FONT,
                  fontWeight: 500,
                  fontSize: 16,
                  width: SKILL_LABEL_WIDTH,
                  textAlign: "right",
                  color: c.WORD_COLOR_ON_BG_APPEARED,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  position: "relative",
                  width: SKILL_TRACK_WIDTH,
                  height: SKILL_TRACK_HEIGHT,
                  borderRadius: SKILL_TRACK_HEIGHT / 2,
                  background: c.BORDER_COLOR,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: fillWidth,
                    borderRadius: SKILL_TRACK_HEIGHT / 2,
                    background: c.WORD_COLOR_ON_BG_APPEARED,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Right column — 1.5 hero + source caption. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          minWidth: 134,
        }}
      >
        <div
          style={{
            ...TITLE_FONT,
            fontSize: 112,
            fontWeight: 600,
            color: c.ACCENT_COLOR,
            letterSpacing: "-0.04em",
            lineHeight: 0.95,
          }}
        >
          <ScaleInNumber value="1.5" delay={heroDelay} />
        </div>
        <div
          style={{
            ...REGULAR_FONT,
            fontWeight: 600,
            fontSize: 13,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: captionOpacity,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginTop: 10,
          }}
        >
          of 5 disciplines
        </div>
        <div
          style={{
            ...REGULAR_FONT,
            fontSize: 12,
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: captionOpacity,
            lineHeight: 1.4,
            marginTop: 6,
            maxWidth: 124,
          }}
        >
          Stack Overflow Dev Survey, 2024
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Panel 3 visual — approval-gate flow.
// RAW → CLEAN → MODEL pipeline. Three gates hang beneath the pills. Before
// focus, gates render muted + strikethrough. During focus, strikethroughs
// un-draw, color crossfades to solid, and a ✓ fades in on each gate.
// -----------------------------------------------------------------------------
const PIPELINE_STAGES = ["RAW", "CLEAN", "MODEL"] as const;
const GATES = [
  "drop rows?",
  "encode how?",
  "regularize when?",
] as const;

const PILL_WIDTH = 108;
const PILL_HEIGHT = 42;
const PILL_GAP = 36; // arrow length between pills
// Gate width tightened to give the rightmost gate breathing room against the
// panel edge + keep ≥ 18px between adjacent gates. At 14px font, the longest
// label ("regularize when?") measures ~92px — fits inside 124 − 26 = 98px
// inner space (badge gap + ✓).
const GATE_WIDTH = 124;
const GATE_HEIGHT = 46;
const GATE_CONNECTOR_HEIGHT = 28;
const GATE_STAGGER = 30;
const GATE_CROSSFADE_FRAMES = 15;
/** Gate body font size. Tightened from 16 → 14 so "regularize when?" fits
 *  inside the narrower gate without label clipping. */
const GATE_LABEL_FONT_SIZE = 14;

const ApprovalGateVisual: React.FC<{
  theme: Theme;
  focusStart: number;
}> = ({ theme, focusStart }) => {
  const c = COLORS[theme];

  const pipelineWidth =
    PIPELINE_STAGES.length * PILL_WIDTH + (PIPELINE_STAGES.length - 1) * PILL_GAP;
  // Gates position beneath each pill center.
  const pillCenters = PIPELINE_STAGES.map(
    (_, i) => i * (PILL_WIDTH + PILL_GAP) + PILL_WIDTH / 2,
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
      }}
    >
      {/* Pipeline row — pills + arrows. */}
      <div
        style={{
          position: "relative",
          width: pipelineWidth,
          height: PILL_HEIGHT,
        }}
      >
        {PIPELINE_STAGES.map((stage, i) => (
          <div
            key={stage}
            style={{
              position: "absolute",
              left: i * (PILL_WIDTH + PILL_GAP),
              top: 0,
              width: PILL_WIDTH,
              height: PILL_HEIGHT,
              borderRadius: PILL_HEIGHT / 2,
              border: `1px solid ${c.BORDER_COLOR}`,
              background: c.BACKGROUND_ELEVATED,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...TITLE_FONT,
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: c.WORD_COLOR_ON_BG_APPEARED,
            }}
          >
            {stage}
          </div>
        ))}
        {PIPELINE_STAGES.slice(0, -1).map((stage, i) => {
          const x = (i + 1) * PILL_WIDTH + i * PILL_GAP;
          return (
            <div
              key={`arrow-${stage}`}
              style={{
                position: "absolute",
                left: x,
                top: PILL_HEIGHT / 2 - 1,
                width: PILL_GAP,
                height: 2,
                pointerEvents: "none",
              }}
            >
              <MotionLine
                x1={0}
                y1={0}
                x2={PILL_GAP}
                y2={0}
                delay={0}
                durationInFrames={20}
                color={c.WORD_COLOR_ON_BG_GREYED}
                strokeWidth={1.25}
                svgWidth={PILL_GAP}
                svgHeight={2}
              />
            </div>
          );
        })}
      </div>

      {/* Gate row — vertical connectors + gates + approvals, beneath each pill. */}
      <div
        style={{
          position: "relative",
          width: pipelineWidth,
          height: GATE_CONNECTOR_HEIGHT + GATE_HEIGHT + 8,
        }}
      >
        {GATES.map((label, i) => {
          const centerX = pillCenters[i] ?? 0;
          const gateStart = focusStart + i * GATE_STAGGER;
          return (
            <ApprovalGate
              key={label}
              theme={theme}
              label={label}
              centerX={centerX}
              revealStart={gateStart}
            />
          );
        })}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// ApprovalGate — single gate badge. Renders muted + strikethrough by default.
// After `revealStart`, strikethrough un-draws, color crossfades to solid, and
// ✓ fades in on the right edge.
// -----------------------------------------------------------------------------
const ApprovalGate: React.FC<{
  theme: Theme;
  label: string;
  centerX: number;
  revealStart: number;
}> = ({ theme, label, centerX, revealStart }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  // Color crossfade 0 (muted) → 1 (solid).
  const solidMix = interpolate(
    frame,
    [revealStart, revealStart + GATE_CROSSFADE_FRAMES],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Muted color = greyed text at 40% opacity (alpha baked via opacity).
  const mutedOpacity = interpolate(solidMix, [0, 1], [0.4, 1]);
  const textColor = solidMix < 0.5
    ? c.WORD_COLOR_ON_BG_GREYED
    : c.WORD_COLOR_ON_BG_APPEARED;

  // ✓ fades in slightly after the crossfade finishes.
  const checkDelay = revealStart + GATE_CROSSFADE_FRAMES + 5;
  const checkOpacity = interpolate(
    frame,
    [checkDelay, checkDelay + 15],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <>
      {/* Vertical connector from pill down to gate. */}
      <div
        style={{
          position: "absolute",
          left: centerX - 1,
          top: 0,
          width: 2,
          height: GATE_CONNECTOR_HEIGHT,
          background: c.WORD_COLOR_ON_BG_GREYED,
          opacity: 0.4,
        }}
      />
      {/* Gate badge. */}
      <div
        style={{
          position: "absolute",
          left: centerX - GATE_WIDTH / 2,
          top: GATE_CONNECTOR_HEIGHT,
          width: GATE_WIDTH,
          height: GATE_HEIGHT,
          borderRadius: GATE_HEIGHT / 2,
          border: `1px solid ${c.BORDER_COLOR}`,
          background: c.BACKGROUND_ELEVATED,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: mutedOpacity,
          ...REGULAR_FONT,
          fontWeight: 500,
          fontSize: GATE_LABEL_FONT_SIZE,
          color: textColor,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ position: "relative", display: "inline-block" }}>
          {label}
          {/* Horizontal strikethrough across the label, un-draws on reveal. */}
          <span
            style={{
              position: "absolute",
              left: -2,
              right: -2,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            <StrikethroughUndraw
              width={labelWidthHint(label)}
              delay={revealStart}
              color={c.WORD_COLOR_ON_BG_GREYED}
            />
          </span>
        </span>
        <span
          aria-hidden="true"
          style={{
            color: c.ACCENT_COLOR,
            opacity: checkOpacity,
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          ✓
        </span>
      </div>
    </>
  );
};

// Rough pixel-width hint for strikethrough line at GATE_LABEL_FONT_SIZE
// Plus Jakarta 500. Avoids DOM measurement — labels are fixed copy.
const labelWidthHint = (label: string): number => {
  switch (label) {
    case "drop rows?":
      return 62;
    case "encode how?":
      return 74;
    case "regularize when?":
      return 92;
    default:
      return label.length * 7;
  }
};

// -----------------------------------------------------------------------------
// StrikethroughUndraw — thin horizontal line that un-draws via dashoffset
// inversion. Present (full length) at frame < delay; empty (0 length) by
// delay + 30.
// -----------------------------------------------------------------------------
const StrikethroughUndraw: React.FC<{
  width: number;
  delay: number;
  color: string;
  svgHeight?: number;
}> = ({ width, delay, color, svgHeight = 12 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 30], [1, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dashoffset = (1 - progress) * width;
  return (
    <svg
      width={width}
      height={svgHeight}
      style={{ overflow: "visible", display: "block" }}
    >
      <line
        x1={0}
        y1={svgHeight / 2}
        x2={width}
        y2={svgHeight / 2}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={width}
        strokeDashoffset={dashoffset}
      />
    </svg>
  );
};

// -----------------------------------------------------------------------------
// Focus-shift opacity. Dims non-focused panels to 0.4 during their window,
// full opacity during their own window, and all panels return to 1.0 during
// the tail hold (frame >= FOCUS_END).
// -----------------------------------------------------------------------------
const focusOpacityAt = (frame: number, panelIndex: number): number => {
  if (frame < FOCUS_START[0] - FOCUS_CROSSFADE_FRAMES) return 1;

  const half = FOCUS_CROSSFADE_FRAMES / 2;

  if (frame >= FOCUS_END) {
    const wasFocused = panelIndex === FOCUS_START.length - 1;
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
    const focused = panelIndex === i ? 1 : FOCUS_DIM;
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
