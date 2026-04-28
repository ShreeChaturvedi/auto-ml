import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, SERIF_FONT } from "../../../config/fonts";
import {
  ARCH_PALETTE,
  SCENE4_5_TRAINING_GRAPH,
  hEdgeCoords,
} from "../../../config/arch-layout";
import { TRAINING_STAGES } from "../../../config/arch-content";
import { AgentEdge } from "../../primitives/AgentEdge";
import { BreathingHaloRing } from "../../primitives/NodeHaloRing";
import { GraphNode, type GraphNodeTier } from "../../primitives/GraphNode";
import { GradientShineText } from "../../primitives/GradientShineText";
import { SlideShell } from "../../primitives/SlideShell";
import { useFadeIn } from "../../helpers/useFadeIn";
import type { SlideBodyProps } from "./index";

/**
 * Silent beat between Scene 4a (propose_model pulsed amber) and Scene 4b
 * (approval bubble + green). 240 frames = 4 seconds of pure hold with three
 * motion elements: BreathingHaloRing on `propose_model`, BreathingHaloRing on
 * the approval label box, and the oklch gradient-shine on the label itself.
 * NO voiceover file in Root.tsx.
 */
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

export const ArchTrainingProposeApprovalSlide: React.FC<SlideBodyProps> = ({
  theme,
}) => {
  const frame = useCurrentFrame();
  const g = SCENE4_5_TRAINING_GRAPH;

  // Frosted-glass veil — deepened 0 → 0.85 over 90f, then holds. Pushes the
  // graph further back so the halo + gradient-shine label read cleanly.
  const overlayOpacity = interpolate(frame, [0, 90], [0, 0.85], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Label entrance — fade + gentle scale punch (0.96 → 1.0 across 30f).
  const labelFade = useFadeIn({ delay: 0, translateY: 12, damping: 200 });
  const labelScale = interpolate(frame, [0, 30], [0.96, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SlideShell theme={theme} eyebrow="AWAITING APPROVAL" divider footer>
      {/* 10-node training graph — frame-matched from Scene 4a final frame. */}
      {Object.entries(g.nodes).map(([id, pos]) => (
        <GraphNode
          key={id}
          x={pos.x}
          y={pos.y}
          w={220}
          h={72}
          label={id}
          tier={NODE_TIER[id] ?? "deterministic"}
          enterFrame={-60} // already settled
          status={id === "propose_model" ? "approval" : "idle"}
        />
      ))}

      {/* Edges — snake-aware via hEdgeCoords; the write_code → execute_training
       *  wrap is rendered as two orthogonal segments (vertical + horizontal)
       *  matching ArchTrainingProposeB for frame-parity. */}
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
        const ec = hEdgeCoords(fp, tp);
        return (
          <AgentEdge
            key={`${from}->${to}`}
            x1={ec.x1}
            y1={ec.y1}
            x2={ec.x2}
            y2={ec.y2}
            drawStartFrame={-60}
            drawDurationFrames={1}
            color={ARCH_PALETTE.edge}
          />
        );
      })}

      {/* Frosted-glass veil — softens the graph to push the halo forward. */}
      <AbsoluteFill
        style={{
          background: ARCH_PALETTE.paper,
          opacity: overlayOpacity,
          pointerEvents: "none",
        }}
      />

      {/* BreathingHaloRing on propose_model — amber, period 120f. */}
      <BreathingHaloRing
        x={g.approval.halo.x}
        y={g.approval.halo.y}
        w={g.approval.halo.w}
        h={g.approval.halo.h}
        color={ARCH_PALETTE.amberBright}
        periodFrames={120}
      />

      {/* BreathingHaloRing around the approval label box — amber, period 120f.
       *  Sits behind the label so the gradient-shine text reads as the hero. */}
      <BreathingHaloRing
        x={g.approval.labelHalo.x}
        y={g.approval.labelHalo.y}
        w={g.approval.labelHalo.w}
        h={g.approval.labelHalo.h}
        color={ARCH_PALETTE.amberBright}
        periodFrames={120}
      />

      {/* AWAITING label — oklch gradient-shine serif. The GradientShineText
       *  primitive is frame-deterministic (no CSS animation) so Remotion's
       *  chunked offline renderer paints the same drift across frame ranges. */}
      <div
        style={{
          position: "absolute",
          left: g.approval.labelBox.x,
          top: g.approval.labelBox.y,
          width: g.approval.labelBox.w,
          height: g.approval.labelBox.h,
          textAlign: "center",
          opacity: labelFade.opacity,
          transform: `${labelFade.transform} scale(${labelScale})`,
          transformOrigin: "center",
        }}
      >
        <GradientShineText
          text="Awaiting human approval."
          fontSize={96}
          fontFamily={SERIF_FONT.fontFamily}
          fontWeight={400}
          periodFrames={480}
          chromaMode="light"
          style={{ textAlign: "center" }}
        />
      </div>

      {/* Sub-label — pendingInputKind literal (backend enum). Monospace is
       *  semantic here: this IS a code identifier, not decoration. */}
      <div
        style={{
          position: "absolute",
          left: g.approval.subLabel.x,
          top: g.approval.subLabel.y,
          width: g.approval.subLabel.w,
          height: g.approval.subLabel.h,
          ...MONOSPACE_FONT,
          fontSize: 20,
          color: ARCH_PALETTE.mute,
          textAlign: "center",
        }}
      >
        pendingInputKind: "approval"
      </div>

      {/* Reuse TRAINING_STAGES to log stage position — used implicitly by
       *  sibling scenes; kept here as a canonical reference. */}
      <div style={{ display: "none" }}>{TRAINING_STAGES.length}</div>
    </SlideShell>
  );
};
