import React from "react";
import { interpolate } from "remotion";
import { EASE_OUT } from "../../../config/easing";
import { REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import { DIMENSIONS } from "../../../config/layout";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { MotionLine } from "../../primitives/MotionLine";
import { ScaleInNumber } from "../../primitives/ScaleInNumber";
import { SlideShell } from "../../primitives/SlideShell";
import { READING_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 7-phase frame budget (60fps). Sum = 720 = 12s. */
const PHASES = [20, 80, 40, 70, 100, 60, 350] as const;
const CHUNK_STAGGER = 25; // Phase 5 cadence — 4 chunks × 25f = 100f window.
const SPINE_X = 72;
const SAFE_TOP = 96;
const SAFE_BOTTOM = 120;
const CONTENT_LEFT = 120;
const SPINE_DRAW_FRAMES = 20;

type SevenPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];
type FourChunks = [StaggeredItem, StaggeredItem, StaggeredItem, StaggeredItem];

/**
 * Cold-open hook (12s / 720f). The 80% hero is the sole element carrying
 * ACCENT_COLOR; serif fragments create typographic contrast only.
 */
export const HookSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const [pSpine, pType, , pHero, pClause, pFootnote] = useTimeline([...PHASES]) as SevenPhases;
  const c = COLORS[theme];
  const spineLength = DIMENSIONS.landscape.height - SAFE_TOP - SAFE_BOTTOM;

  const chunks = useStaggeredFadeIn(4, {
    step: CHUNK_STAGGER,
    startDelay: pClause.start,
    translateY: 8,
    damping: 180,
  }) as FourChunks;

  const footnoteOpacity = interpolate(pFootnote.t, [0, 1], [0, 0.55], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SlideShell theme={theme} eyebrow="CSE 449 · CAPSTONE" spine={false}>
      {/* Phase 1 — animated spine drawn top→bottom over 20f. */}
      <div
        style={{
          position: "absolute",
          top: SAFE_TOP,
          left: SPINE_X,
          pointerEvents: "none",
        }}
      >
        <MotionLine
          x1={0}
          y1={0}
          x2={0}
          y2={spineLength}
          delay={pSpine.start}
          durationInFrames={SPINE_DRAW_FRAMES}
          color={c.BORDER_COLOR}
          svgWidth={2}
          svgHeight={spineLength}
        />
      </div>

      {/* Main line — ~42% vertical center leaves room for footnote below. */}
      <div
        style={{
          position: "absolute",
          top: "42%",
          left: CONTENT_LEFT,
          right: 96,
          transform: "translateY(-50%)",
          maxWidth: 1400,
          ...TITLE_FONT,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          fontSize: 76,
          lineHeight: 1.12,
          letterSpacing: "-0.015em",
          textWrap: "balance",
        }}
      >
        <TypeOnText
          text="Data scientists spend "
          rate={READING_RATE}
          delay={pType.start}
          caret={false}
        />
        <span
          style={{
            ...TITLE_FONT,
            fontSize: 132,
            color: c.ACCENT_COLOR,
            verticalAlign: "middle",
            margin: "0 8px",
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          <ScaleInNumber value="80%" delay={pHero.start} />
        </span>
        <Chunk item={chunks[0]} font={REGULAR_FONT}>of their time </Chunk>
        <Chunk item={chunks[1]} font={REGULAR_FONT}>on everything </Chunk>
        <Chunk item={chunks[2]} font={SERIF_FONT}>except </Chunk>
        <Chunk item={chunks[3]} font={SERIF_FONT}>training models.</Chunk>
      </div>

      <FootnoteHairline
        theme={theme}
        delay={pFootnote.start}
        opacity={footnoteOpacity}
      />
    </SlideShell>
  );
};

/** Inline word-chunk. Serif chunks get letterSpacing 0em + optical-size bump. */
const Chunk: React.FC<{
  item: StaggeredItem;
  font: React.CSSProperties;
  children: React.ReactNode;
}> = ({ item, font, children }) => (
  <span
    style={{
      ...font,
      ...(font === SERIF_FONT ? { letterSpacing: "0em", fontSize: "1.12em" } : {}),
      opacity: item.opacity,
      transform: item.transform,
      display: "inline-block",
    }}
  >
    {children}
  </span>
);

/** 240px hairline + greyed attribution, anchored above the bottom safe-area. */
const FootnoteHairline: React.FC<{ theme: Theme; delay: number; opacity: number }> = ({
  theme,
  delay,
  opacity,
}) => {
  const c = COLORS[theme];
  return (
    <div style={{ position: "absolute", left: CONTENT_LEFT, bottom: SAFE_BOTTOM + 24, opacity }}>
      <MotionLine x1={0} y1={0} x2={240} y2={0} delay={delay} color={c.BORDER_COLOR} svgWidth={240} svgHeight={2} />
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 18,
          marginTop: 12,
          color: c.WORD_COLOR_ON_BG_GREYED,
          letterSpacing: "0.01em",
        }}
      >
        — Anaconda State of Data Science, 2022.
      </div>
    </div>
  );
};
