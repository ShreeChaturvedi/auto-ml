import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../config/easing";
import { REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, READING_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";
import { Panel1Fragmentation } from "./ProblemTrio/Panel1Fragmentation";
import { Panel2SkillStack } from "./ProblemTrio/Panel2SkillStack";
import { Panel3ApprovalGate } from "./ProblemTrio/Panel3ApprovalGate";

// -----------------------------------------------------------------------------
// Frame budget (60fps). Sum = 2040 = 34s.
// -----------------------------------------------------------------------------
//   1. 0–20       eyebrow + header divider settle
//   2. 20–110     heading types in (neutral color — no inline accent)
//   3. 110–200    panels stagger-fade (15f each)
//   4. 200–260    panel headlines type + body fades 0→60%→100%
//   5. 260–300    panel internal hairlines draw
//   6. 300–600    Panel 1 focus window (300f) — pentagon tool fragmentation
//   7. 600–1020   Panel 2 focus window (420f) — skill-stack hero + bars
//   8. 1020–1560  Panel 3 focus window (540f) — approval-gate pipeline
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
// Bumped 640 → 660 so the visual region keeps its prior height after the
// PANEL_TEXT_HEIGHT bump (260 → 280) absorbed by the larger body fontSize.
const PANEL_HEIGHT = 660;
const PANEL_GAP = 24;
const PANEL_PADDING = 40;
const PANEL_RADIUS = 8;
const PANEL_SHADOW = "0 2px 12px rgba(0, 0, 0, 0.04)";
const PANEL_BORDER = "rgba(0, 0, 0, 0.10)";

// 260 → 280: the body fontSize bump (18 → 20) plus the 8 px headline-to-body
// breathing-room bump add ~20 px of vertical demand to the text region.
const PANEL_TEXT_HEIGHT = 280;
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
  // Bumped 18 → 20 so the secondary copy carries the same gravity the
  // larger 28 px headline already does. The PANEL_TEXT_HEIGHT bump above
  // absorbs the resulting line-height growth.
  fontSize: 20,
  lineHeight: 1.5,
  // Bumped 18 → 26 (+8 px) per polish brief: more vertical room between the
  // headline and the body so the two read as distinct registers, not stacked
  // copy lines.
  marginTop: 26,
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
    <SlideShell theme={theme} eyebrow="THE PROBLEM" pageNumber="05">
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

      {/* Bottom visual region — delegated to bespoke per-panel components. */}
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
          <Panel1Fragmentation theme={theme} focusStart={focusStart} />
        ) : index === 1 ? (
          <Panel2SkillStack theme={theme} focusStart={focusStart} />
        ) : (
          <Panel3ApprovalGate theme={theme} focusStart={focusStart} />
        )}
      </div>
    </div>
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
