import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_IN_OUT, EASE_OUT, SPRING_UI } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT } from "../../../config/fonts";
import {
  ARCH_PALETTE,
  SCENE4_5_TRAINING_GRAPH,
  hEdgeCoords,
} from "../../../config/arch-layout";
import { AgentEdge } from "../../primitives/AgentEdge";
import {
  BreathingHaloRing,
  NodeHaloRing,
} from "../../primitives/NodeHaloRing";
import { GraphNode, type GraphNodeTier } from "../../primitives/GraphNode";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/**
 * Scene 4b — 600 frames / 10s. Dim overlay fades, approval bubble slides in,
 * BreathingHaloRing transitions amber → green via color interpolation, bead
 * resumes propose_model → generate_code. Ends with the graph primed for
 * Scene 5's ZoomFrame carry-match.
 */
const PHASES = [60, 48, 40, 80, 300, 72] as const;

type SixPhases = [
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
];
// 0: overlay fades out
// 1: approval bubble slides in
// 2: amber → green color interpolate + green halo pulse
// 3: bead propose_model → generate_code
// 4: hold (frame-match into Scene 5)
// 5: settle

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

export const ArchTrainingProposeBSlide: React.FC<SlideBodyProps> = ({
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [pOverlay, pBubble, pAmberGreen, pBead] = useTimeline([
    ...PHASES,
  ]) as SixPhases;
  const g = SCENE4_5_TRAINING_GRAPH;

  // Frosted-glass veil fades out during phase 0 (60f). Peak matches the
  // approval silent-beat slide (0.60) for a seamless frame-match handoff.
  const overlayOpacity = interpolate(
    frame,
    [pOverlay.start, pOverlay.end],
    [0.6, 0],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Approval bubble — SPRING_UI slide from translateX +300.
  const bubbleSpring = spring({
    fps,
    frame: frame - pBubble.start,
    config: SPRING_UI,
    durationInFrames: 48,
  });
  const bubbleOpacity = interpolate(bubbleSpring, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bubbleTx = interpolate(bubbleSpring, [0, 1], [300, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Amber → green color blend (40f, phase 2).
  const blendProgress = interpolate(
    frame,
    [pAmberGreen.start, pAmberGreen.end],
    [0, 1],
    { easing: EASE_IN_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const breatheColor =
    blendProgress < 0.5 ? ARCH_PALETTE.amberBright : ARCH_PALETTE.successGreenBright;

  return (
    <SlideShell theme={theme} eyebrow="APPROVED" divider footer>
      {/* 10-node graph (frame-match carry). */}
      {Object.entries(g.nodes).map(([id, pos]) => (
        <GraphNode
          key={id}
          x={pos.x}
          y={pos.y}
          w={220}
          h={72}
          label={id}
          tier={NODE_TIER[id] ?? "deterministic"}
          enterFrame={-60}
          status={
            id === "propose_model"
              ? blendProgress > 0.5
                ? "success"
                : "approval"
              : "idle"
          }
        />
      ))}

      {/* 9 edges already drawn (frame-match from Scene 4a). Same two-edge
       *  wrap for write_code → execute_training, same hEdgeCoords swap for
       *  the reversed row-2 boustrophedon. */}
      {EDGES.map(([from, to]) => {
        if (from === "write_code" && to === "execute_training") {
          return (
            <React.Fragment key={`${from}->${to}`}>
              <AgentEdge
                x1={1650}
                y1={396}
                x2={1650}
                y2={696}
                drawStartFrame={-60}
                drawDurationFrames={1}
                color={ARCH_PALETTE.edge}
                arrowhead={false}
              />
              <AgentEdge
                x1={1650}
                y1={696}
                x2={1540}
                y2={696}
                drawStartFrame={-60}
                drawDurationFrames={1}
                color={ARCH_PALETTE.edge}
              />
            </React.Fragment>
          );
        }
        const fp = g.nodes[from as keyof typeof g.nodes];
        const tp = g.nodes[to as keyof typeof g.nodes];
        const coords = hEdgeCoords(fp, tp);
        const isActive = from === "propose_model" && to === "generate_code";
        return (
          <AgentEdge
            key={`${from}->${to}`}
            x1={coords.x1}
            y1={coords.y1}
            x2={coords.x2}
            y2={coords.y2}
            drawStartFrame={-60}
            drawDurationFrames={1}
            color={ARCH_PALETTE.edge}
            beadStartFrame={isActive ? pBead.start : undefined}
            beadDurationFrames={80}
            beadColor={ARCH_PALETTE.successGreen}
          />
        );
      })}

      {/* Frosted-glass veil fading out. */}
      <AbsoluteFill
        style={{
          background: ARCH_PALETTE.paper,
          opacity: overlayOpacity,
          pointerEvents: "none",
        }}
      />

      {/* BreathingHaloRing on propose_model — color transitions amber→green. */}
      <BreathingHaloRing
        x={g.approval.halo.x}
        y={g.approval.halo.y}
        w={g.approval.halo.w}
        h={g.approval.halo.h}
        color={breatheColor}
        periodFrames={120}
        minOpacity={blendProgress > 0.5 ? 0.2 : 0.3}
        maxOpacity={blendProgress > 0.5 ? 0.5 : 0.7}
      />

      {/* Single green NodeHaloRing pulse at the color-blend frame. */}
      <NodeHaloRing
        x={g.approval.halo.x}
        y={g.approval.halo.y}
        w={g.approval.halo.w}
        h={g.approval.halo.h}
        color={ARCH_PALETTE.successGreenBright}
        at={pAmberGreen.start}
        durationFrames={36}
        peakOpacity={0.9}
        peakScale={1.35}
      />

      {/* Approval bubble (right side). */}
      <div
        style={{
          position: "absolute",
          left: g.approvalBubble.x,
          top: g.approvalBubble.y,
          width: g.approvalBubble.w,
          height: g.approvalBubble.h,
          background: ARCH_PALETTE.paper,
          border: `1px solid ${ARCH_PALETTE.hairline}`,
          borderRadius: 12,
          boxShadow: "0 12px 32px -8px rgba(0,0,0,0.08)",
          padding: "18px 24px",
          opacity: bubbleOpacity,
          transform: `translateX(${bubbleTx}px)`,
        }}
      >
        {/* Approved badge appears 18f into bubble. */}
        <div
          style={{
            ...MONOSPACE_FONT,
            fontSize: 14,
            fontWeight: 600,
            color: ARCH_PALETTE.successGreen,
            marginBottom: 8,
          }}
        >
          <TypeOnText
            text="✓ Approved"
            rate={LABEL_RATE}
            delay={pBubble.start + 18}
            caret={false}
          />
        </div>
        <div
          style={{
            ...REGULAR_FONT,
            fontSize: 20,
            fontWeight: 500,
            color: ARCH_PALETTE.ink,
          }}
        >
          user: &quot;Approve XGBoost.&quot;
        </div>
      </div>
    </SlideShell>
  );
};
