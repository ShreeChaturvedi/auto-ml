import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ARCH_PALETTE } from "../../../config/arch-layout";
import type {
  RetroSlideConfig,
  RetroStatement,
} from "../../../config/reflection-content";
import {
  DIFFERENTLY_TOOLCALL,
  WENT_WELL_GRAPH,
} from "../../../config/reflection-content";
import {
  REFLECTION_TONES,
  RETRO_LAYOUT,
} from "../../../config/reflection-layout";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, TITLE_FONT } from "../../../config/fonts";
import { COLORS, type Theme } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { AgentEdge } from "../../primitives/AgentEdge";
import { FlourishUnderline } from "../../primitives/FlourishUnderline";
import { GraphNode } from "../../primitives/GraphNode";
import { BreathingHaloRing } from "../../primitives/NodeHaloRing";
import { SlideShell } from "../../primitives/SlideShell";
import { ToolCallCard } from "../../primitives/ToolCallCard";
import {
  useStaggeredFadeIn,
  type StaggeredItem,
} from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";

const PHASES = [30, 30, 30, 120, 90, 60, 60] as const;
type SevenPhases = [
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
];

export type RetroSlideShellProps = {
  theme: Theme;
  config: RetroSlideConfig;
};

/**
 * Shared retro chrome (Slides 6-8). Eyebrow · title · statements (with
 * tone-colored FlourishUnderlines under each `emphasis` phrase) · optional
 * right-rail anchor (graph-column or ToolCallCard).
 */
export const RetroSlideShell: React.FC<RetroSlideShellProps> = ({
  theme,
  config,
}) => {
  const [
    pShell,
    pTitle,
    pAnchor,
    pStatements,
    ,
    ,
    pHold,
  ] = useTimeline([...PHASES]) as SevenPhases;

  const c = COLORS[theme];
  const tone = REFLECTION_TONES[config.tone];
  const isLearned = config.id === "learned";
  const statementsLayout = isLearned
    ? RETRO_LAYOUT.statementsLearned
    : RETRO_LAYOUT.statements;

  const shellFade = useFadeIn({ delay: pShell.start, durationInFrames: 30 });
  const titleFade = useFadeIn({
    delay: pTitle.start,
    translateY: 10,
    damping: 200,
  });

  const items = useStaggeredFadeIn(config.statements.length, {
    step: 40,
    startDelay: pStatements.start,
    translateY: 18,
    damping: 200,
  });

  return (
    <SlideShell theme={theme} eyebrow={config.eyebrow} divider footer>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: shellFade.opacity,
        }}
      >
        {/* Title. */}
        <div
          style={{
            position: "absolute",
            left: RETRO_LAYOUT.title.x,
            top: RETRO_LAYOUT.title.y,
            width: RETRO_LAYOUT.title.w,
            ...TITLE_FONT,
            fontSize: RETRO_LAYOUT.title.fontSize,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: titleFade.opacity,
            transform: titleFade.transform,
          }}
        >
          {config.title}
        </div>

        {/* Statements column — flow layout so gaps respect actual wrapped
         *  height (statements >1 line will otherwise collide if we stack by
         *  `i * fontSize*lineHeight` since that math only accounts for a
         *  single-line row). */}
        <div
          style={{
            position: "absolute",
            left: statementsLayout.x,
            top: statementsLayout.y,
            width: statementsLayout.w,
            display: "flex",
            flexDirection: "column",
            gap: statementsLayout.gap,
          }}
        >
          {config.statements.map((statement, i) => (
            <RetroStatementRow
              key={`${config.id}-${i}`}
              statement={statement}
              item={items[i]!}
              tone={tone}
              fontSize={statementsLayout.fontSize}
              lineHeight={statementsLayout.lineHeight}
              flourishDelay={pStatements.end - 20 + i * 30}
            />
          ))}
        </div>

        {/* Anchor slot — Slide 7 (graph) or Slide 8 (toolcall). */}
        {config.anchor === "graph" ? (
          <WentWellAnchor anchorStart={pAnchor.start} haloStart={pHold.start} />
        ) : null}
        {config.anchor === "toolcall" ? (
          <DifferentlyAnchor anchorStart={pAnchor.start} haloStart={pHold.start} />
        ) : null}
      </div>
    </SlideShell>
  );
};

const RetroStatementRow: React.FC<{
  statement: RetroStatement;
  item: StaggeredItem;
  tone: (typeof REFLECTION_TONES)[keyof typeof REFLECTION_TONES];
  fontSize: number;
  lineHeight: number;
  flourishDelay: number;
}> = ({ statement, item, tone, fontSize, lineHeight, flourishDelay }) => {
  const idx = statement.body.indexOf(statement.emphasis);
  const pre = idx >= 0 ? statement.body.slice(0, idx) : statement.body;
  const mid = idx >= 0 ? statement.emphasis : "";
  const post =
    idx >= 0 ? statement.body.slice(idx + statement.emphasis.length) : "";

  return (
    <div
      style={{
        ...TITLE_FONT,
        fontWeight: 700,
        fontSize,
        lineHeight,
        color: ARCH_PALETTE.ink,
        letterSpacing: "-0.015em",
        opacity: item.opacity,
        transform: item.transform,
      }}
    >
      {pre}
      {mid ? (
        <span
          style={{
            position: "relative",
            display: "inline-block",
            lineHeight,
            // `nowrap` keeps the whole emphasis phrase on a single line so the
            // underline covers the entire phrase instead of trailing onto a
            // second wrapped line (which would only underline the fragment).
            whiteSpace: "nowrap",
            // Emphasis sits one step heavier than the already-bold 700 body
            // so the phrase reads as emphasized at glance even without color.
            fontWeight: 800,
          }}
        >
          {mid}
          <FlourishUnderline
            delay={flourishDelay}
            drawOut={false}
            color={tone.stroke}
            style={{
              position: "absolute",
              top: "calc(100% - 2px)",
              left: 0,
              width: "100%",
              height: 14,
            }}
          />
        </span>
      ) : null}
      {post}
    </div>
  );
};

const WentWellAnchor: React.FC<{
  anchorStart: number;
  haloStart: number;
}> = ({ anchorStart, haloStart }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [anchorStart, anchorStart + 24],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const nodes = WENT_WELL_GRAPH.nodes;
  const edges = WENT_WELL_GRAPH.edges;
  const g = RETRO_LAYOUT.graphNode;

  return (
    <div
      style={{
        position: "absolute",
        left: RETRO_LAYOUT.anchorSlot.x,
        top: RETRO_LAYOUT.anchorSlot.y,
        width: RETRO_LAYOUT.anchorSlot.w,
        height: RETRO_LAYOUT.anchorSlot.h,
        opacity,
      }}
    >
      {nodes.map((n, i) => (
        <GraphNode
          key={n.label}
          label={n.label}
          x={g.x - RETRO_LAYOUT.anchorSlot.x}
          y={g.yStart - RETRO_LAYOUT.anchorSlot.y + i * g.yStep}
          w={g.w}
          h={g.h}
          tier="llm_delegated"
          enterFrame={anchorStart + 10 + i * 12}
        />
      ))}
      {edges.map(({ from, to }, i) => {
        const fy = g.yStart - RETRO_LAYOUT.anchorSlot.y + from * g.yStep + g.h;
        const ty = g.yStart - RETRO_LAYOUT.anchorSlot.y + to * g.yStep;
        const midX = g.x - RETRO_LAYOUT.anchorSlot.x + g.w / 2;
        return (
          <AgentEdge
            key={`edge-${i}`}
            x1={midX}
            y1={fy}
            x2={midX}
            y2={ty}
            drawStartFrame={anchorStart + 40 + i * 12}
            drawDurationFrames={30}
            // Beads travel during P5 (scene frames 300-360); with 28f duration
            // and a 30f stagger both beads fit comfortably before P6 starts.
            beadStartFrame={300 + i * 30}
            beadDurationFrames={28}
            beadColor={REFLECTION_TONES.green.stroke}
            arrowhead={false}
            color={REFLECTION_TONES.green.stroke}
          />
        );
      })}
      {/* Breathing halo on the middle (tool_call) node. Higher opacity
       *  range than the journey-pulse halo because the node is narrower
       *  and the ring has to carry more visual weight solo. */}
      <BreathingHaloRing
        x={g.x - RETRO_LAYOUT.anchorSlot.x}
        y={g.yStart - RETRO_LAYOUT.anchorSlot.y + g.yStep}
        w={g.w}
        h={g.h}
        at={haloStart}
        color={REFLECTION_TONES.green.stroke}
        minOpacity={0.25}
        maxOpacity={0.55}
        periodFrames={120}
        radius={10}
        strokeWidth={3}
      />
    </div>
  );
};

const DifferentlyAnchor: React.FC<{
  anchorStart: number;
  haloStart: number;
}> = ({ anchorStart, haloStart }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [anchorStart, anchorStart + 24],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: RETRO_LAYOUT.anchorSlot.x,
        top: RETRO_LAYOUT.anchorSlot.y,
        width: RETRO_LAYOUT.anchorSlot.w,
        height: RETRO_LAYOUT.anchorSlot.h,
        opacity,
      }}
    >
      <ToolCallCard
        x={0}
        y={40}
        w={RETRO_LAYOUT.toolCall.w}
        icon="code"
        title={DIFFERENTLY_TOOLCALL.title}
        subtitle="imagined architecture"
        status="pending"
        statusLabel="active"
        body={{
          kind: "code",
          lines: [...DIFFERENTLY_TOOLCALL.body, DIFFERENTLY_TOOLCALL.footer],
        }}
        enterFrame={anchorStart + 20}
        enterDurationFrames={24}
      />
      {/* Breathing halo wraps the entire ToolCallCard. Slightly muted so
       *  the card content stays dominant; stroke 2 px matches card border. */}
      <BreathingHaloRing
        x={-4}
        y={36}
        w={RETRO_LAYOUT.toolCall.w + 8}
        h={240}
        at={haloStart}
        color={REFLECTION_TONES.amber.stroke}
        minOpacity={0.15}
        maxOpacity={0.40}
        periodFrames={120}
        radius={10}
        strokeWidth={2}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          ...MONOSPACE_FONT,
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: ARCH_PALETTE.mute,
        }}
      >
        what we&apos;d build first
      </div>
    </div>
  );
};
