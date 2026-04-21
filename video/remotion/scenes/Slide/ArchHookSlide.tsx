import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  MONOSPACE_FONT,
  REGULAR_FONT,
  SERIF_FONT,
  TITLE_FONT,
} from "../../../config/fonts";
import {
  ARCH_PALETTE,
  SCENE4_5_TRAINING_GRAPH,
  SHIMMER_PERIOD_FRAMES,
  hEdgeCoords,
} from "../../../config/arch-layout";
import { SAFE_AREA } from "../../../config/layout";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { AgentEdge } from "../../primitives/AgentEdge";
import { FlourishUnderline } from "../../primitives/FlourishUnderline";
import { GraphNode, type GraphNodeTier } from "../../primitives/GraphNode";
import { SlideShell } from "../../primitives/SlideShell";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 8-phase timeline (sum = 1080 = 18s @ 60fps).
 *  0: AbsoluteFill fade in
 *  1: eyebrow + divider draw
 *  2: title fade-in (was typewriter)
 *  3: serif line 1  — problem framing (non-italic serif)
 *  4: serif line 2  — problem escalation (non-italic serif)
 *  5: sans line 3   — solution answer (sans 600, declarative)
 *  6: squiggle flourish under "machinery"
 *  7: hold (divider shimmer only)
 */
const PHASES = [30, 30, 100, 80, 80, 80, 60, 620] as const;

type EightPhases = [
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
];

const TITLE = "How this actually runs.";

// Ghost training-graph constants — read-only mini-preview of Scene 4/5.
const GHOST_NODE_TIER: Record<string, GraphNodeTier> = {
  answer: "text",
  configure_experiment: "text",
  propose_model: "text",
  generate_code: "llm_delegated",
  write_code: "deterministic",
  execute_training: "deterministic",
  evaluate_results: "deterministic",
  await_review: "text",
  register_model: "action",
  summarize: "text",
};

const GHOST_EDGES: Array<[string, string]> = [
  ["answer", "configure_experiment"],
  ["configure_experiment", "propose_model"],
  ["propose_model", "generate_code"],
  ["generate_code", "write_code"],
  ["write_code", "execute_training"],
  ["execute_training", "evaluate_results"],
  ["evaluate_results", "await_review"],
  ["await_review", "register_model"],
  ["register_model", "summarize"],
];

export const ArchHookSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const [pFade, , pTitle, pLine1, pLine2, pLine3, pUnderline] = useTimeline([
    ...PHASES,
  ]) as EightPhases;
  const c = COLORS[theme];
  const g = SCENE4_5_TRAINING_GRAPH;

  const fade = useFadeIn({
    delay: pFade.start,
    durationInFrames: 30,
  });

  // Title now fades in (editorial, matches the body rhythm).
  const titleFade = useFadeIn({
    delay: pTitle.start,
    translateY: 8,
    damping: 200,
  });

  // Staggered serif entries — small translateY + fade.
  const line1 = useFadeIn({
    delay: pLine1.start,
    translateY: 12,
    damping: 200,
  });
  const line2 = useFadeIn({
    delay: pLine2.start,
    translateY: 12,
    damping: 200,
  });
  const line3 = useFadeIn({
    delay: pLine3.start,
    translateY: 12,
    damping: 200,
  });
  // Hairline settles just after the flourish begins drawing.
  const hairlineFade = useFadeIn({
    delay: pUnderline.start + 40,
    translateY: 4,
    damping: 200,
  });

  // Shimmer on divider during the hold phase (cosine loop 120f).
  const shimmerFrame = Math.max(0, frame - (pUnderline?.start ?? 420));
  const shimmerPhase = (shimmerFrame % SHIMMER_PERIOD_FRAMES) /
    SHIMMER_PERIOD_FRAMES;
  const shimmerNorm = (Math.cos(shimmerPhase * Math.PI * 2) + 1) / 2;
  const shimmerOpacity = 0.4 + 0.6 * shimmerNorm;

  // Ambient radial bloom — slow drift behind "machinery" on line 3.
  // Anchored near y≈240 with a 40px drift over the full 1080-frame scene.
  const bloomShift = interpolate(frame, [0, 1080], [0, 40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SlideShell theme={theme} eyebrow="THE BACKEND" divider footer>
      {/* Ambient bloom — lowest z so every other element sits on top. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${
            460 + bloomShift
          }px ${240 + bloomShift * 0.5}px, rgba(196,18,48,0.03), transparent 40%)`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: fade.opacity,
        }}
      >
        {/* Shimmer overlay atop the SlideShell divider band — targets the
         *  divider row using an aligned rect so the cosine loop only modulates
         *  opacity, preserving the Miami-red → tan gradient underneath. */}
        <div
          style={{
            position: "absolute",
            top: 176,
            left: SAFE_AREA.left,
            width: 1920 - SAFE_AREA.left - SAFE_AREA.right,
            height: 2,
            background: c.BACKGROUND,
            opacity: 1 - shimmerOpacity,
            mixBlendMode: "overlay",
            pointerEvents: "none",
          }}
        />

        {/* --------------------------------------------------------------- */}
        {/* LEFT COLUMN — title + body. 72px leading @ fs32 (y=240/336/408/480). */}
        {/* --------------------------------------------------------------- */}

        {/* Title — fade-in (was TypeOnText). Keeps the editorial pacing. */}
        <div
          style={{
            position: "absolute",
            left: SAFE_AREA.contentLeft,
            top: 240,
            width: 900 - SAFE_AREA.contentLeft,
            ...TITLE_FONT,
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: titleFade.opacity,
            transform: titleFade.transform,
          }}
        >
          {TITLE}
        </div>

        {/* Serif body lines 1 & 2 — non-italic serif carries the "problem"
         *  register (reflective, restrained). Individual word-color accents
         *  (green for "easy", Miami red for "is not") stay scoped to inline
         *  <span>s so the surrounding phrase inherits the default body color. */}
        <div
          style={{
            position: "absolute",
            left: SAFE_AREA.contentLeft,
            top: 336,
            width: 1600,
            ...SERIF_FONT,
            fontSize: 32,
            lineHeight: 1.25,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: line1.opacity,
            transform: line1.transform,
          }}
        >
          A chatbot that writes code is{"\u00A0"}
          <span
            style={{
              color: ARCH_PALETTE.successGreen,
              fontWeight: 700,
            }}
          >
            easy
          </span>
          .
        </div>
        <div
          style={{
            position: "absolute",
            left: SAFE_AREA.contentLeft,
            top: 408,
            width: 1600,
            ...SERIF_FONT,
            fontSize: 32,
            lineHeight: 1.25,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: line2.opacity,
            transform: line2.transform,
          }}
        >
          A chatbot that writes code, runs it, fails, recovers, and commits the
          result —{"\u00A0"}
          <span
            style={{
              color: ARCH_PALETTE.miamiRed,
              fontWeight: 700,
            }}
          >
            is not
          </span>
          .
        </div>

        {/* Line 3 — TONAL PIVOT (sans-serif, declarative). Sits below line 2
         *  at tightened leading. Underline flourish accents "machinery". */}
        <div
          style={{
            position: "absolute",
            left: SAFE_AREA.contentLeft,
            top: 480,
            width: 1600,
            ...REGULAR_FONT,
            fontWeight: 600,
            fontSize: 32,
            letterSpacing: "-0.005em",
            lineHeight: 1.25,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: line3.opacity,
            transform: line3.transform,
          }}
        >
          Here&apos;s the{" "}
          <span
            style={{
              position: "relative",
              display: "inline-block",
              lineHeight: 1.25,
            }}
          >
            machinery
            <FlourishUnderline
              delay={pUnderline.start}
              drawOut={false}
              color={ARCH_PALETTE.miamiRed}
              style={{
                position: "absolute",
                top: "calc(100% - 4px)",
                left: 0,
                width: "100%",
                height: 16,
              }}
            />
          </span>{" "}
          that makes it boring.
        </div>

        {/* Hairline rule under the type block — caps the column at y=560. */}
        <div
          style={{
            position: "absolute",
            left: SAFE_AREA.contentLeft,
            top: 560,
            width: 1600,
            height: 1,
            background: ARCH_PALETTE.hairline,
            opacity: hairlineFade.opacity * 0.35,
            transform: hairlineFade.transform,
          }}
        />

        {/* --------------------------------------------------------------- */}
        {/* RIGHT COLUMN — ghost mini-preview of the 10-node training graph. */}
        {/* Frozen, opacity 0.16, scale 0.42. No motion, no cards, no halos. */}
        {/* TODO: swap `ARCH_PALETTE.hairline` → `ARCH_PALETTE.edge` once the */}
        {/* edge token lands (Agent A).                                      */}
        {/* --------------------------------------------------------------- */}
        <div
          style={{
            position: "absolute",
            left: 1060,
            top: 280,
            width: 840,
            height: 480,
            transform: "scale(0.42)",
            transformOrigin: "top left",
            opacity: 0.16,
            pointerEvents: "none",
          }}
        >
          {Object.entries(g.nodes).map(([id, pos]) => (
            <GraphNode
              key={id}
              x={pos.x - g.nodes.answer.x}
              y={pos.y - g.nodes.answer.y}
              w={220}
              h={72}
              label={id}
              tier={GHOST_NODE_TIER[id] ?? "deterministic"}
              enterFrame={-60}
            />
          ))}
          {GHOST_EDGES.map(([from, to]) => {
            const fp = g.nodes[from as keyof typeof g.nodes];
            const tp = g.nodes[to as keyof typeof g.nodes];
            const isWrap =
              from === "write_code" && to === "execute_training";
            const offX = g.nodes.answer.x;
            const offY = g.nodes.answer.y;
            if (isWrap) {
              return (
                <React.Fragment key={`${from}->${to}`}>
                  <AgentEdge
                    x1={1650 - offX}
                    y1={396 - offY}
                    x2={1650 - offX}
                    y2={696 - offY}
                    drawStartFrame={-60}
                    drawDurationFrames={1}
                    color={ARCH_PALETTE.edge}
                    arrowhead={false}
                  />
                  <AgentEdge
                    x1={1650 - offX}
                    y1={696 - offY}
                    x2={1540 - offX}
                    y2={696 - offY}
                    drawStartFrame={-60}
                    drawDurationFrames={1}
                    color={ARCH_PALETTE.edge}
                  />
                </React.Fragment>
              );
            }
            const coords = hEdgeCoords(fp, tp);
            return (
              <AgentEdge
                key={`${from}->${to}`}
                x1={coords.x1 - offX}
                y1={coords.y1 - offY}
                x2={coords.x2 - offX}
                y2={coords.y2 - offY}
                drawStartFrame={-60}
                drawDurationFrames={1}
                color={ARCH_PALETTE.edge}
              />
            );
          })}
        </div>

        {/* Top-right scene counter — tiny mono label. */}
        <div
          style={{
            position: "absolute",
            right: 200,
            top: 96,
            ...MONOSPACE_FONT,
            fontSize: 14,
            color: ARCH_PALETTE.mute,
          }}
        >
          scene 1 / 6
        </div>
      </div>
    </SlideShell>
  );
};
