import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_OUT, SPRING_SETTLE } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import {
  ARCH_PALETTE,
  SCENE2_ENGINE,
  SCENE3,
  SHIMMER_PERIOD_FRAMES,
} from "../../../config/arch-layout";
import {
  SNIPPET_STAGE_TOOL_ALLOWLIST,
  STAGE_COUNTS,
} from "../../../config/arch-content";
import { COLORS } from "../../../config/themes";
import { AgentEdge } from "../../primitives/AgentEdge";
import { CodeCellReveal } from "../../primitives/CodeCellReveal";
import { GraphNode, type GraphNodeTier } from "../../primitives/GraphNode";
import { SlideShell } from "../../primitives/SlideShell";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/**
 * Scene 3 — engine shrinks to scale 0.6 and 3 phase cards plug into the
 * `prepare` node via dashed connectors. Shiki reveals STAGE_TOOL_ALLOWLIST
 * on the right. Training card gets a pre-zoom cue (amber border breathe) to
 * telegraph Scene 4a's SPRING_HERO engage.
 *
 * Total: 1320f / 22s.
 */
const PHASES = [
  60, // 0: engine shrink
  240, // 1: phase cards stagger in
  240, // 2: dashed connectors
  180, // 3: connector labels
  300, // 4: Shiki panel mount + MaskReveal
  180, // 5: training card outline pulse (blue)
  120, // 6: training card amber breathe (prep-zoom cue)
] as const;

type SevenPhases = [
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
];

const PHASE_CARDS = [
  {
    counter: "01",
    title: "PREPROCESSING",
    stages: STAGE_COUNTS.preprocessing,
    tool: "commit_transformation_step",
  },
  {
    counter: "02",
    title: "FEATURE ENGINEERING",
    stages: STAGE_COUNTS.featureEngineering,
    tool: "register_feature",
  },
  {
    counter: "03",
    title: "TRAINING",
    stages: STAGE_COUNTS.training,
    tool: "execute_training",
  },
];

const NODE_TIER: Record<string, GraphNodeTier> = {
  start: "text",
  prepare: "deterministic",
  invoke_model: "llm_delegated",
  execute_tools: "action",
  pause: "deterministic",
  complete: "deterministic",
  fail: "deterministic",
};

export const ArchPhaseAdapterSlide: React.FC<SlideBodyProps> = ({
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [
    pShrink,
    pCards,
    pConnectors,
    ,
    pShiki,
    pOutline,
    pBreathe,
  ] = useTimeline([...PHASES]) as SevenPhases;
  const c = COLORS[theme];

  // Engine shrink: 1 → 0.6 via SPRING_SETTLE, translated DOWN so the top row
  // stays anchored to its Scene 2 position (y=332). The engine "concertinas"
  // vertically — top row fixed, bottom row compacts up — rather than
  // collapsing toward the divider.
  //
  // Geometry (transformOrigin: 50% 0%):
  //   Final node y = origY * engineScale + engineTy
  //
  //   Original bug: engineTy = −140 pulled the top row to 332*0.6 − 140 = 59,
  //   a full 117px ABOVE the Miami-red divider (y=176) — it bled into the
  //   header zone, trampling the eyebrow + divider.
  //
  //   Fix: choose engineTy so the top row lands at exactly 332 at peak shrink
  //   (matching Scene 2 and the title gap convention):
  //       332 * 0.6 + engineTy = 332  →  engineTy = 132.8 ≈ 133
  //
  //   Parametrize as engineTy(p) = 133 * p so at p=0 (Scene 2 final pose) the
  //   engine sits untransformed, and at p=1 the top row is exactly at y=332.
  //
  //   Monotonic check — top row y across p ∈ [0, 1]:
  //       y(p) = 332 * (1 − 0.4p) + 133p = 332 + 0.2p
  //   Range: [332, 332.2] — top row is effectively stationary, well below the
  //   divider (176) and well below the title baseline (title top 232 + fontSize
  //   48 ≈ 290 → 42px clearance).
  //
  //   Bottom row compacts up: 684*(1 − 0.4p) + 133p = 684 − 140.6p.
  //   p=0 → 684 (Scene 2), p=1 → 543.4 (well above cards at y=760).
  const shrinkProgress = spring({
    fps,
    frame: frame - pShrink.start,
    config: SPRING_SETTLE,
    durationInFrames: 60,
  });
  const engineScale = 1 - shrinkProgress * 0.4;
  const engineTy = shrinkProgress * 133;

  // Card stagger — 3 cards at step 60f.
  const cardItems = useStaggeredFadeIn(PHASE_CARDS.length, {
    step: 60,
    startDelay: pCards.start,
    translateY: 40,
    damping: 200,
  });

  // Title establishes the scene's topic during phase 0 (engine shrink) — NOT
  // tied to card entry, so the viewer reads the heading before the cards land.
  // Matches ArchEngineSlide's titleFade pattern: interpolate over the phase
  // window with EASE_OUT.
  const titleFade = interpolate(
    frame,
    [pShrink.start, pShrink.start + 30],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Inner-row stagger helper — each card's counter / title / stages / tool
  // chip fade in one after another. Anchored to each card's stagger slot
  // (pCards.start + i*60) so the reveal paces naturally with the card's
  // entry. Offsets: 0, 10, 20, 30 → last row finishes at +46f (< 60f slot).
  const rowFade = (cardIndex: number, rowOffset: number) => {
    const base = pCards.start + cardIndex * 60 + rowOffset;
    return interpolate(
      frame,
      [base, base + 16],
      [0, 1],
      { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  };

  // Training card amber breathe during prep-zoom cue phase.
  const breatheFrame = Math.max(0, frame - pBreathe.start);
  const breatheNorm =
    (Math.cos((breatheFrame % 120) / 120 * Math.PI * 2) + 1) / 2;
  const breatheOpacity = 0.4 + 0.6 * breatheNorm;

  // Shimmer on engine edges during the hold.
  const shimmerFrame = Math.max(0, frame - pShrink.end);
  const shimmerNorm =
    (Math.cos((shimmerFrame % SHIMMER_PERIOD_FRAMES) / SHIMMER_PERIOD_FRAMES * Math.PI * 2) + 1) / 2;
  // Clamp shimmer range so edges never dim below 0.75 — matches Scene 2's
  // engine hold so the diagram reads consistently across the two slides.
  const shimmerOpacity = 0.75 + 0.25 * shimmerNorm;

  const g = SCENE2_ENGINE;

  return (
    <SlideShell theme={theme} eyebrow="PHASE ADAPTERS" divider footer>
      {/* Scaled engine wrapper — all 6 nodes + 7 edges ride the SPRING_SETTLE
       *  transform. Frame-matched from Scene 2's final pose. */}
      <AbsoluteFill
        style={{
          transform: `translateY(${engineTy}px) scale(${engineScale})`,
          transformOrigin: "50% 0%",
          pointerEvents: "none",
        }}
      >
        {Object.entries(g.nodes).map(([id, pos]) => (
          <GraphNode
            key={id}
            x={pos.x}
            y={pos.y}
            w={220}
            h={72}
            label={id === "start" ? "START" : id}
            tier={NODE_TIER[id] ?? "deterministic"}
            enterFrame={-60}
          />
        ))}
        {[
          ["start", "prepare"],
          ["prepare", "invoke_model"],
          ["invoke_model", "execute_tools"],
        ].map(([from, to]) => {
          const fp = g.nodes[from as keyof typeof g.nodes];
          const tp = g.nodes[to as keyof typeof g.nodes];
          return (
            <AgentEdge
              key={`${from}->${to}`}
              x1={fp.x + 220}
              y1={fp.y + 36}
              x2={tp.x}
              y2={tp.y + 36}
              drawStartFrame={-60}
              drawDurationFrames={1}
              color={ARCH_PALETTE.edge}
              style={{ opacity: shimmerOpacity }}
            />
          );
        })}
        {/* Fan-out edges — execute_tools → pause/complete/fail. Must live
         *  INSIDE the scaled wrapper so the edge coordinates (computed at
         *  natural engine size) scale + translate with the nodes. Without
         *  this, the fan nodes appear on screen but their edges either
         *  render at untransformed coords (shooting off-canvas) or don't
         *  render at all — both read as "disconnected" to the viewer. */}
        {[
          ["execute_tools", "pause"],
          ["execute_tools", "complete"],
          ["execute_tools", "fail"],
        ].map(([from, to]) => {
          const fp = g.nodes[from as keyof typeof g.nodes];
          const tp = g.nodes[to as keyof typeof g.nodes];
          return (
            <AgentEdge
              key={`${from}->${to}`}
              x1={fp.x + 110}
              y1={fp.y + 72}
              x2={tp.x + 110}
              y2={tp.y}
              drawStartFrame={-60}
              drawDurationFrames={1}
              color={ARCH_PALETTE.edge}
              style={{ opacity: shimmerOpacity }}
            />
          );
        })}
      </AbsoluteFill>

      {/* Title — sits in the standard heading row (y=232, matches ArchHookSlide
       *  and ArchEngineSlide) so the scene announces its topic before the
       *  phase cards land. Copy mirrors Scene 2's "One graph. Six nodes. Every
       *  phase." rhythm — "One engine. Three rulebooks." — reinforcing the
       *  shared-engine / per-phase-rulebook framing (STAGE_TOOL_ALLOWLIST is
       *  literally a rulebook per phase), without the cringy em-dashed claim
       *  of the earlier draft. */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 232,
          width: 1600,
          ...TITLE_FONT,
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: titleFade,
        }}
      >
        One engine. Three rulebooks.
      </div>

      {/* 3 phase cards at y=760. */}
      {PHASE_CARDS.map((card, i) => {
        const cardX = i === 0 ? SCENE3.cards.x0 : i === 1 ? SCENE3.cards.x1 : SCENE3.cards.x2;
        const isTraining = card.title === "TRAINING";
        const opacity = cardItems[i]?.opacity ?? 0;
        const transform = cardItems[i]?.transform;
        // Training card borderColor rotates:
        //   idle / outline phase: blue pulse
        //   breathe phase:        amber (cosine modulated)
        let borderColor: string = ARCH_PALETTE.ink;
        let borderWidth = 1;
        if (isTraining) {
          if (frame >= pBreathe.start) {
            borderColor = ARCH_PALETTE.amberBright;
            borderWidth = 1.5;
          } else if (frame >= pOutline.start) {
            borderColor = ARCH_PALETTE.accentBlue;
            borderWidth = 1.5;
          }
        }
        return (
          <div
            key={card.title}
            style={{
              position: "absolute",
              left: cardX,
              top: SCENE3.cards.y,
              width: SCENE3.cards.w,
              height: SCENE3.cards.h,
              background: c.BACKGROUND_ELEVATED,
              border: `${borderWidth}px solid ${borderColor}`,
              borderRadius: 12,
              boxShadow: "0 8px 24px -6px rgba(0,0,0,0.06)",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              opacity,
              transform,
              // Amber breathe is expressed through a secondary inner glow
              // layered on top of the card (avoids animating the border color
              // fully, which would strobe the pulse outline itself).
            }}
          >
            {isTraining && frame >= pBreathe.start ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 12,
                  boxShadow: `inset 0 0 0 3px rgba(217,119,6,${breatheOpacity * 0.6})`,
                  pointerEvents: "none",
                }}
              />
            ) : null}
            {/* Inner rows stagger with micro-offsets so each piece of info
             *  lands in sequence instead of snapping in as a block:
             *    counter  +0f   (immediate with card)
             *    title    +10f
             *    stages   +20f
             *    tool     +30f  (finish at +46f, well under the 60f card slot) */}
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 20,
                color: ARCH_PALETTE.mute,
                opacity: rowFade(i, 0),
              }}
            >
              {card.counter}
            </div>
            <div
              style={{
                ...TITLE_FONT,
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: ARCH_PALETTE.ink,
                opacity: rowFade(i, 10),
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 16,
                color: ARCH_PALETTE.mute,
                opacity: rowFade(i, 20),
              }}
            >
              {card.stages} stages
            </div>
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: ARCH_PALETTE.accentBlue,
                marginTop: "auto",
                opacity: rowFade(i, 30),
              }}
            >
              {card.tool}
            </div>
          </div>
        );
      })}

      {/* Dashed PhaseConfig connectors — from each card's top to `prepare`
       *  node's bottom (at scaled engine coords). Each connector draws during
       *  phase pConnectors, staggered by 30f. */}
      {PHASE_CARDS.map((card, i) => {
        const cardX = i === 0 ? SCENE3.cards.x0 : i === 1 ? SCENE3.cards.x1 : SCENE3.cards.x2;
        const x = cardX + SCENE3.cards.w / 2;
        const drawStart = pConnectors.start + i * 30;
        const preparePos = g.nodes.prepare;
        const scaledPrepareX = preparePos.x * engineScale + 960 * (1 - engineScale) / 2 + 110 * engineScale;
        const scaledPrepareY = preparePos.y * engineScale + 36 * engineScale + engineTy;
        return (
          <AgentEdge
            key={`connector-${card.title}`}
            x1={x}
            y1={SCENE3.cards.y}
            x2={scaledPrepareX}
            y2={scaledPrepareY + 72 * engineScale}
            drawStartFrame={drawStart}
            drawDurationFrames={48}
            strokeDasharray="8 4"
            color={ARCH_PALETTE.mute}
            arrowhead={false}
          />
        );
      })}

      {/* Shiki panel — STAGE_TOOL_ALLOWLIST (right side). */}
      <div
        style={{
          position: "absolute",
          left: SCENE3.shiki.x,
          top: SCENE3.shiki.y,
          width: SCENE3.shiki.w,
          height: SCENE3.shiki.h,
          background: c.BACKGROUND_ELEVATED,
          border: `1px solid ${ARCH_PALETTE.hairline}`,
          borderRadius: 20,
          boxShadow: "0 30px 80px -12px rgba(0,0,0,0.20)",
          padding: 24,
          opacity: interpolate(
            frame,
            [pShiki.start, pShiki.start + 36],
            [0, 1],
            { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      >
        <div
          style={{
            ...MONOSPACE_FONT,
            fontSize: 14,
            fontWeight: 600,
            color: ARCH_PALETTE.mute,
            marginBottom: 12,
          }}
        >
          training.ts · STAGE_TOOL_ALLOWLIST
        </div>
        {/*
          Code body — landing-page notebook cell with character-by-character
          reveal. We don't render the filename chrome here because this scene
          already displays the "training.ts · STAGE_TOOL_ALLOWLIST" label in
          the panel above (owned by the other agent); showing both would
          double-label. Reveal spans 80f, matching the prior MaskReveal.
        */}
        <CodeCellReveal
          code={SNIPPET_STAGE_TOOL_ALLOWLIST}
          lang="ts"
          startFrame={pShiki.start + 36}
          durationFrames={80}
          fontSize={14}
          lineHeight={1.55}
          showLineNumbers
        />
        <div
          style={{
            ...REGULAR_FONT,
            fontSize: 16,
            color: ARCH_PALETTE.mute,
            marginTop: 20,
          }}
        >
          The model cannot reach for a tool that doesn&apos;t belong here.
        </div>
      </div>
    </SlideShell>
  );
};
