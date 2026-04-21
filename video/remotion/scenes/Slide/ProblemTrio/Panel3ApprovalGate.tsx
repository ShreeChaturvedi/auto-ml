import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_OUT, SPRING_SETTLE } from "../../../../config/easing";
import { REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../../config/fonts";
import type { Theme } from "../../../../config/themes";
import { COLORS } from "../../../../config/themes";
import { AgentEdge } from "../../../primitives/AgentEdge";
import { BreathingHaloRing } from "../../../primitives/NodeHaloRing";
import { GraphNode } from "../../../primitives/GraphNode";

// -----------------------------------------------------------------------------
// Panel 3 visual — RAW → APPROVAL → MODEL agent pipeline.
//
// Replaces the RAW / CLEAN / MODEL pill row + dangling gate badges with a
// proper 3-node agent flow that puts the approval gate ON the path itself,
// not as an aside. The middle node (APPROVAL) renders as the LLM-delegated
// tier so it visually distinguishes from the deterministic ingest and the
// action-tier model registration. A breathing halo ring sustains around the
// approval node throughout the focus window so the eye lands there.
//
// Stack (top → bottom inside the visual region):
//   1. ✓ approval badge — 20px circle above the middle node, fades in once
//      the halo settles
//   2. 3 nodes + 2 edges — horizontally centered
//   3. Caption — italic serif gloss describing the gate semantic
// -----------------------------------------------------------------------------

const NODE_W = 110;
const NODE_H = 44;
const NODE_RADIUS = 10;
const NODE_GAP = 40;
const NODE_ENTER_DURATION = 22;
const NODE_STAGGER = 12;

const PIPELINE_WIDTH = NODE_W * 3 + NODE_GAP * 2; // 410

// PIPELINE_WIDTH (410) sits well inside the 472-px-wide visual region (panel
// chrome 552 minus 40 px padding on each side). Container is centered via the
// parent flexbox + a fixed-width child.

const PIPELINE_VERTICAL_OFFSET = 18; // shift down so the badge has airspace

const BADGE_DIAMETER = 26;
const BADGE_RING_THICKNESS = 2;

const CAPTION_GAP = 36;

type Stage = {
  label: string;
  tier: "deterministic" | "llm_delegated" | "action";
};

const STAGES: readonly Stage[] = [
  { label: "RAW", tier: "deterministic" },
  { label: "APPROVAL", tier: "llm_delegated" },
  { label: "MODEL", tier: "action" },
] as const;

export const Panel3ApprovalGate: React.FC<{
  theme: Theme;
  focusStart: number;
}> = ({ theme, focusStart }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = COLORS[theme];

  // Per-stage entry frames.
  const nodeEnterFrames = STAGES.map((_, i) => focusStart + i * NODE_STAGGER);
  // Edges land once both endpoints settle.
  const edgeStarts = [
    nodeEnterFrames[1]! + NODE_ENTER_DURATION,
    nodeEnterFrames[2]! + NODE_ENTER_DURATION,
  ];
  const lastEdgeDone = edgeStarts[1]! + 32;

  const captionDelay = lastEdgeDone + 30;
  const captionOpacity = interpolate(
    frame,
    [captionDelay, captionDelay + 24],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ✓ badge appears 40 f after focusStart per spec, with a calmer settle so the
  // mark doesn't jitter against the breathing halo.
  const badgeDelay = focusStart + 40;
  const badgeProgress = spring({
    fps,
    frame: frame - badgeDelay,
    config: SPRING_SETTLE,
    durationInFrames: 24,
  });
  const badgeScale = interpolate(badgeProgress, [0, 1], [0.6, 1]);
  const badgeOpacity = interpolate(badgeProgress, [0, 1], [0, 1]);

  // Pipeline render coords are local to the centered PIPELINE_WIDTH container.
  const nodeCoords = STAGES.map((_, i) => ({
    x: i * (NODE_W + NODE_GAP),
    y: PIPELINE_VERTICAL_OFFSET,
  }));
  // Middle node center (for the halo + badge anchor).
  const midNode = nodeCoords[1]!;
  const midCenterX = midNode.x + NODE_W / 2;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "relative",
          width: PIPELINE_WIDTH,
          height: NODE_H + PIPELINE_VERTICAL_OFFSET + BADGE_DIAMETER + 12,
        }}
      >
        {/* Breathing halo on the APPROVAL node — sustained across the 540 f
         *  focus window (vs NodeHaloRing's one-shot ≤ 36 f pulse). Explicit
         *  ACCENT color so the ARCH_PALETTE.amberBright default doesn't leak. */}
        <BreathingHaloRing
          x={midNode.x}
          y={midNode.y}
          w={NODE_W}
          h={NODE_H}
          radius={NODE_RADIUS}
          at={focusStart}
          color={c.ACCENT_COLOR}
          minOpacity={0.15}
          maxOpacity={0.5}
          strokeWidth={2}
        />

        {/* Edges — drawn behind nodes via DOM order. */}
        {edgeStarts.map((start, i) => {
          const from = nodeCoords[i]!;
          const to = nodeCoords[i + 1]!;
          return (
            <AgentEdge
              key={`edge-${i}`}
              x1={from.x + NODE_W}
              y1={from.y + NODE_H / 2}
              x2={to.x}
              y2={to.y + NODE_H / 2}
              drawStartFrame={start}
              drawDurationFrames={32}
              color={c.WORD_COLOR_ON_BG_GREYED}
              strokeWidth={1.5}
              arrowhead
            />
          );
        })}

        {/* Pipeline nodes. Explicit theme tokens so non-arch palette is honored. */}
        {STAGES.map((stage, i) => {
          const pos = nodeCoords[i]!;
          // Action-tier nodes draw their label in white-on-ink by default; we
          // honor that for "MODEL" but force theme-aware bg/border on the
          // deterministic + llm_delegated nodes.
          const isAction = stage.tier === "action";
          return (
            <GraphNode
              key={stage.label}
              x={pos.x}
              y={pos.y}
              w={NODE_W}
              h={NODE_H}
              radius={NODE_RADIUS}
              tier={stage.tier}
              enterFrame={nodeEnterFrames[i]}
              enterDurationFrames={NODE_ENTER_DURATION}
              background={
                isAction ? c.WORD_COLOR_ON_BG_APPEARED : c.BACKGROUND_ELEVATED
              }
              borderColor={c.WORD_COLOR_ON_BG_APPEARED}
              textColor={
                isAction ? c.BACKGROUND : c.WORD_COLOR_ON_BG_APPEARED
              }
            >
              <span
                style={{
                  ...TITLE_FONT,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: isAction ? c.BACKGROUND : c.WORD_COLOR_ON_BG_APPEARED,
                  lineHeight: 1,
                }}
              >
                {stage.label}
              </span>
            </GraphNode>
          );
        })}

        {/* ✓ approval badge — 26 px circle with a hand-drawn check, anchored
         *  above the APPROVAL node. The check itself is an SVG so the stroke
         *  geometry survives the spring scale-in cleanly. */}
        <div
          style={{
            position: "absolute",
            left: midCenterX - BADGE_DIAMETER / 2,
            top: midNode.y - BADGE_DIAMETER - 8,
            width: BADGE_DIAMETER,
            height: BADGE_DIAMETER,
            borderRadius: BADGE_DIAMETER / 2,
            background: c.BACKGROUND_ELEVATED,
            border: `${BADGE_RING_THICKNESS}px solid ${c.ACCENT_COLOR}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${badgeScale})`,
            transformOrigin: "center center",
            opacity: badgeOpacity,
            boxShadow: `0 4px 10px -4px ${c.ACCENT_COLOR}40`,
          }}
          aria-hidden="true"
        >
          <svg width={14} height={14} viewBox="0 0 14 14">
            <path
              d="M3 7 L6 10 L11 4"
              fill="none"
              stroke={c.ACCENT_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Caption — serif gloss tying the pipeline back to the
       *  argument: AutoML hides this decision; we surface it. */}
      <div
        style={{
          ...SERIF_FONT,
          fontSize: 18,
          lineHeight: 1.35,
          color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: captionOpacity,
          marginTop: CAPTION_GAP,
          textAlign: "center",
          maxWidth: 320,
        }}
      >
        Every design choice on the record.
      </div>
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 12,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: captionOpacity,
          marginTop: 8,
        }}
      >
        Approve · Edit · Reject
      </div>
    </div>
  );
};
