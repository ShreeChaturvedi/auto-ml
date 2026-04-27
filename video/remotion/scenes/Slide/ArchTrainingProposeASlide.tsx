import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SPRING_HERO } from "../../../config/easing";
import {
  ARCH_PALETTE,
  SCENE4_5_TRAINING_GRAPH,
  hEdgeCoords,
} from "../../../config/arch-layout";
import { AgentEdge } from "../../primitives/AgentEdge";
import { GraphNode, type GraphNodeTier } from "../../primitives/GraphNode";
import { NodeHaloRing } from "../../primitives/NodeHaloRing";
import { SlideShell } from "../../primitives/SlideShell";
import { ToolCallCard } from "../../primitives/ToolCallCard";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/**
 * Scene 4a — 900 frames / 15s. Training lifecycle materializes inside a
 * SPRING_HERO zoom (the one allowed dramatic zoom besides Scene 6's reverse
 * pullback). Three beads ride `answer → configure → propose`, two tool-call
 * cards slide in on the right, and the scene ends on `propose_model` pulsed
 * amber — priming the approval-pause silent slide that follows.
 */

// Phase budget (sum = 900f / 15s):
//   0: SPRING_HERO zoom engage           60
//   1: 10 nodes stagger                  120
//   2: 9 edges draw                      180
//   3: bead `answer` + halo              120
//   4: bead `answer → configure` + card1 180
//   5: bead `configure → propose` + card2 180
//   6: propose_model amber pre-pulse     60
const PHASES = [60, 120, 180, 120, 180, 180, 60] as const;

type SevenPhases = [
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
];

const NODE_TIER: Record<string, GraphNodeTier> = {
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

const EDGES: Array<[string, string]> = [
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

export const ArchTrainingProposeASlide: React.FC<SlideBodyProps> = ({
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [pZoom, pNodes, pEdges, pBead0, pBead1, pBead2, pPulse] = useTimeline([
    ...PHASES,
  ]) as SevenPhases;
  const g = SCENE4_5_TRAINING_GRAPH;

  // SPRING_HERO engage — the carry-match state for Scene 5. This is the
  // single SPRING_HERO moment on the arc's entry (use #1 of 2).
  const zoomProgress = spring({
    fps,
    frame: frame - pZoom.start,
    config: SPRING_HERO,
    durationInFrames: 60,
  });
  // Scale the composition slightly — a subtle "we're inside the training
  // card" cue without overwhelming the graph layout.
  const zoomScale = 1 + zoomProgress * 0.05;

  // Per-stage node indices for `enterFrame` stagger.
  const nodeEntries = Object.entries(g.nodes);
  const STAGGER_STRIDE = 6;

  // When card 2 (`propose_training_plan`) slides in, card 1 dims so the
  // viewer's focus moves cleanly right. Matches the attention transition
  // pattern used on the engine slide's Shiki handoff.
  const card1Focus =
    frame < pBead2.start
      ? 1
      : interpolate(frame, [pBead2.start, pBead2.start + 20], [1, 0.35], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  return (
    <SlideShell theme={theme} eyebrow="TRAINING LIFECYCLE" divider footer>
      <AbsoluteFill
        style={{
          transform: `scale(${zoomScale})`,
          transformOrigin: "60% 50%",
        }}
      >
        {/* 10 GraphNode with staggered enter frames. */}
        {nodeEntries.map(([id, pos], i) => (
          <GraphNode
            key={id}
            x={pos.x}
            y={pos.y}
            w={220}
            h={72}
            label={id}
            tier={NODE_TIER[id] ?? "deterministic"}
            enterFrame={pNodes.start + i * STAGGER_STRIDE}
            status={
              id === "answer" && frame >= pBead0.start
                ? "active"
                : id === "configure_experiment" && frame >= pBead1.end
                  ? "active"
                  : id === "propose_model" && frame >= pPulse.start
                    ? "retry" // amber pre-pulse (RETRY palette = amber)
                    : "idle"
            }
          />
        ))}

        {/* 9 edges — staggered draw from phase pEdges. The row-1→row-2 wrap
         *  (`write_code → execute_training`) is rendered as a two-segment
         *  elbow: a vertical drop from write_code's right side down to the
         *  same x at row 2, then a short 110px left-nudge into the right
         *  edge of execute_training. Every other edge is horizontal and
         *  uses `hEdgeCoords` so row 2 (now R→L) swaps sides automatically. */}
        {EDGES.map(([from, to], i) => {
          if (from === "write_code" && to === "execute_training") {
            // Wrap elbow — two AgentEdges. Segment A: vertical drop with no
            // arrowhead. Segment B: 110px left nudge with arrowhead. Drawing
            // them back-to-back reads as a continuous L-shaped arrow.
            return (
              <React.Fragment key={`${from}->${to}`}>
                <AgentEdge
                  x1={1650}
                  y1={396}
                  x2={1650}
                  y2={696}
                  drawStartFrame={pEdges.start + i * 30}
                  drawDurationFrames={48}
                  color={ARCH_PALETTE.edge}
                  arrowhead={false}
                />
                <AgentEdge
                  x1={1650}
                  y1={696}
                  x2={1540}
                  y2={696}
                  drawStartFrame={pEdges.start + i * 30 + 24}
                  drawDurationFrames={24}
                  color={ARCH_PALETTE.edge}
                />
              </React.Fragment>
            );
          }
          const fp = g.nodes[from as keyof typeof g.nodes];
          const tp = g.nodes[to as keyof typeof g.nodes];
          const coords = hEdgeCoords(fp, tp);
          const isBead1 = from === "answer" && to === "configure_experiment";
          const isBead2 = from === "configure_experiment" && to === "propose_model";
          return (
            <AgentEdge
              key={`${from}->${to}`}
              x1={coords.x1}
              y1={coords.y1}
              x2={coords.x2}
              y2={coords.y2}
              drawStartFrame={pEdges.start + i * 30}
              drawDurationFrames={48}
              color={ARCH_PALETTE.edge}
              beadStartFrame={
                isBead1 ? pBead1.start : isBead2 ? pBead2.start : undefined
              }
              beadDurationFrames={60}
            />
          );
        })}

        {/* Halo around `answer` at bead0 window. */}
        <NodeHaloRing
          x={g.nodes.answer.x}
          y={g.nodes.answer.y}
          w={220}
          h={72}
          at={pBead0.start}
          durationFrames={60}
          color={ARCH_PALETTE.accentBlue}
        />
      </AbsoluteFill>

      {/* Tool-call card 1 — configure_experiment. Header-only (no body) so the
       *  card reads like the real frontend's compact tool invocation: the
       *  subtitle carries the call-args, the pill carries the lifecycle. Sits
       *  in the bottom-left gap so it never occludes row 1 nodes. */}
      <ToolCallCard
        x={g.toolCallCard1.x}
        y={g.toolCallCard1.y}
        w={g.toolCallCard1.w}
        icon="wrench"
        title="configure_experiment"
        subtitle="creditcard.csv · fraud · roc_auc"
        enterFrame={pBead1.start}
        focusOpacity={card1Focus}
        statusTimeline={[
          { atFrame: pBead1.start, status: "running" },
          { atFrame: pBead2.start, status: "success" },
        ]}
      />

      {/* Tool-call card 2 — propose_training_plan. Bottom-right mirror of card
       *  1, header-only. Transitions to `success` 90f after entry so the scene
       *  lands on "both tools completed" just before pPulse. */}
      <ToolCallCard
        x={g.toolCallCard2.x}
        y={g.toolCallCard2.y}
        w={g.toolCallCard2.w}
        icon="flask"
        title="propose_training_plan"
        subtitle="3 candidates"
        enterFrame={pBead2.start}
        statusTimeline={[
          { atFrame: pBead2.start, status: "running" },
          { atFrame: pBead2.start + 90, status: "success" },
        ]}
      />
    </SlideShell>
  );
};
