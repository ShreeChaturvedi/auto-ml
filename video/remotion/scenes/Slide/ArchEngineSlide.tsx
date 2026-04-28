import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, TITLE_FONT } from "../../../config/fonts";
import {
  ARCH_PALETTE,
  SCENE2_ENGINE,
  SHIMMER_PERIOD_FRAMES,
} from "../../../config/arch-layout";
import {
  NDJSON_EVENT_TYPES,
  SNIPPET_GRAPH_TS,
} from "../../../config/arch-content";
import { COLORS } from "../../../config/themes";
import { AgentEdge } from "../../primitives/AgentEdge";
import { CodeCellReveal } from "../../primitives/CodeCellReveal";
import { GraphNode, type GraphNodeTier } from "../../primitives/GraphNode";
import { NDJSONTape } from "../../primitives/NDJSONTape";
import { NodeHaloRing } from "../../primitives/NodeHaloRing";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/**
 * Scene 2 — the 6-node compiled StateGraph. Nodes land staggered, 7 edges
 * draw in, routeNextStep label appears at the fan-out, a loop-back bead
 * traverses once, then the right-side Shiki panel reveals `graph.ts`. State
 * reducer legend chips enter below, a full-loop bead traverses, then the
 * NDJSONTape slides in from the right-lower quadrant for the first time.
 *
 * Total: 1920f / 32s.
 */
const PHASES = [
  60, // 0: title fade
  300, // 1: 6 nodes stagger
  180, // 2: forward edges
  240, // 3: fan-out edges + routeNextStep label + loop-back
  420, // 4: Shiki panel unfurl + mask reveal
  300, // 5: state-reducer legend
  300, // 6: full loop bead traverse
  120, // 7: NDJSONTape + hold
] as const;

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

const NODE_TIER: Record<string, GraphNodeTier> = {
  start: "text",
  prepare: "deterministic",
  invoke_model: "llm_delegated",
  execute_tools: "action",
  pause: "deterministic",
  complete: "deterministic",
  fail: "deterministic",
};

const FORWARD_EDGES: Array<[string, string]> = [
  ["start", "prepare"],
  ["prepare", "invoke_model"],
  ["invoke_model", "execute_tools"],
];

const FAN_EDGES: Array<[string, string]> = [
  ["execute_tools", "pause"],
  ["execute_tools", "complete"],
  ["execute_tools", "fail"],
];

const REDUCER_LEGEND = [
  { key: "messages", desc: "append-only" },
  { key: "toolCalls", desc: "array reducer" },
  { key: "pendingInputKind", desc: "last-wins" },
];

export const ArchEngineSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const [
    pTitle,
    pNodes,
    ,
    pFanEdges,
    pShiki,
    pLegend,
    pLoopBead,
    pTape,
  ] = useTimeline([...PHASES]) as EightPhases;
  const c = COLORS[theme];
  const g = SCENE2_ENGINE;

  const legendItems = useStaggeredFadeIn(REDUCER_LEGEND.length, {
    step: 18,
    startDelay: pLegend.start,
    translateY: 16,
    damping: 200,
  });

  // Shimmer on all edges after Scene 2's edges finish drawing — subtle
  // cosine loop that makes the diagram feel alive during the hold.
  const shimmerFrame = Math.max(0, frame - pFanEdges.end);
  const shimmerNorm =
    (Math.cos((shimmerFrame % SHIMMER_PERIOD_FRAMES) / SHIMMER_PERIOD_FRAMES * Math.PI * 2) + 1) / 2;
  // Clamp shimmer range so edges never dim below 0.75 — keeps the diagram
  // legible throughout the hold; the "breathing" effect stays subtle.
  const shimmerOpacity = 0.75 + 0.25 * shimmerNorm;

  const titleFade = interpolate(frame, [pTitle.start, pTitle.end], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const allNodes = Object.entries(g.nodes);

  // Per-region attenuation — dims regions that are no longer the focal point
  // as subsequent phases pull the viewer's attention elsewhere. Piecewise
  // linear across the 5 phase-entry points so each region's trajectory is
  // auditable in a single array.
  const attenKeys = [
    pNodes.start,
    pShiki.start,
    pLegend.start,
    pLoopBead.start,
    pTape.start,
  ];
  const graphAtten = interpolate(frame, attenKeys, [1.0, 0.7, 0.55, 1.0, 0.75], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chipAtten = interpolate(frame, attenKeys, [1.0, 0.5, 0.35, 0.35, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const legendAtten = interpolate(frame, attenKeys, [0, 0, 1.0, 0.65, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tapeAtten = interpolate(frame, attenKeys, [0, 0, 0, 0, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Dotted connector from routeNextStep chip → execute_tools right edge.
  // Fades OUT as the Shiki panel takes over focus (the code panel's arrival
  // is the cue that the graph caption is no longer the center of attention).
  const connectorOpacity = interpolate(
    frame,
    [pShiki.start, pShiki.start + 24],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <SlideShell theme={theme} eyebrow="THE ENGINE" divider footer>
      {/*
        Title: "One state graph."
        Brainstormed alternatives before committing:
          - "The control loop"          (misleads — scene fans out, doesn't loop)
          - "How the graph runs"        (question-y, teacher voice)
          - "Inside the loop"           (same "loop" misframing)
          - "The engine"                (collides with eyebrow "THE ENGINE")
          - "Every phase, one graph"    (inverts emphasis)
          - "One state graph"           *chosen*
        "One state graph" echoes the VO ("It's a LangGraph state graph"),
        primes the reducer legend that enters below via the word "state,"
        and is the shortest technical framing that doesn't recycle the
        eyebrow. Three words read as a chapter heading, not marketing copy.
      */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 232,
          width: 1400,
          ...TITLE_FONT,
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: titleFade,
        }}
      >
        One state graph.
      </div>

      {/* 6-node + START graph canvas (left side). Attenuated during Shiki
       *  and legend focus beats, then re-lit when the loop-back bead
       *  traverses. */}
      <AbsoluteFill style={{ pointerEvents: "none", opacity: graphAtten }}>
        {/* Nodes with staggered enter frames. */}
        {allNodes.map(([id, pos], i) => (
          <GraphNode
            key={id}
            x={pos.x}
            y={pos.y}
            w={220}
            h={72}
            label={id === "start" ? "START" : id}
            tier={NODE_TIER[id] ?? "deterministic"}
            enterFrame={pNodes.start + i * 40}
            status={
              id === "execute_tools" && frame >= pFanEdges.start
                ? "active"
                : "idle"
            }
          />
        ))}

        {/* Forward edges (horizontal row). */}
        {FORWARD_EDGES.map(([from, to], i) => {
          const fp = g.nodes[from as keyof typeof g.nodes];
          const tp = g.nodes[to as keyof typeof g.nodes];
          return (
            <AgentEdge
              key={`${from}->${to}`}
              x1={fp.x + 220}
              y1={fp.y + 36}
              x2={tp.x}
              y2={tp.y + 36}
              // Edge i connects node i → node i+1; start drawing when node i+1
              // is ~80% through its enter spring (16f ≈ 80% of 20f settle).
              drawStartFrame={pNodes.start + (i + 1) * 40 + 16}
              drawDurationFrames={48}
              color={ARCH_PALETTE.edge}
              style={{ opacity: shimmerOpacity }}
            />
          );
        })}

        {/* Fan-out edges + routeNextStep label above execute_tools. */}
        {FAN_EDGES.map(([from, to], i) => {
          const fp = g.nodes[from as keyof typeof g.nodes];
          const tp = g.nodes[to as keyof typeof g.nodes];
          return (
            <AgentEdge
              key={`${from}->${to}`}
              x1={fp.x + 110}
              y1={fp.y + 72}
              x2={tp.x + 110}
              y2={tp.y}
              // Target nodes (pause/complete/fail) enter at pNodes.start +
              // (i + 4) * 40; draw each fan edge as its target settles.
              drawStartFrame={pNodes.start + (i + 4) * 40 + 16}
              drawDurationFrames={48}
              color={ARCH_PALETTE.edge}
              style={{ opacity: shimmerOpacity }}
            />
          );
        })}

        {/* Loop-back edge — execute_tools → prepare. Arcs up and over the
         *  title area, exiting execute_tools' top-center (998, 332) and
         *  re-entering prepare's top-center (506, 332). arcHeight=72 keeps
         *  the peak at y≈260, comfortably clear of the "One state graph."
         *  title below. */}
        <AgentEdge
          x1={998}
          y1={332}
          x2={506}
          y2={332}
          arcHeight={72}
          drawStartFrame={pFanEdges.start + 120}
          drawDurationFrames={60}
          color={ARCH_PALETTE.edge}
          beadStartFrame={pLoopBead.start}
          beadDurationFrames={108}
          arrowhead={false}
          style={{ opacity: shimmerOpacity }}
        />

        {/*
          routeNextStep router chip — VO dedicates a full line to this
          ("A router reads the state and picks the next node"), so it needs
          to read as a first-class callout, not a tiny monospace annotation.
          We render it as a pill with an accent-blue outline anchored to the
          right of execute_tools (at x=1124, y=352 — the row's right flank),
          tied back to the node by a faint dotted connector that fades out
          once the Shiki panel arrives.
        */}
        <div
          style={{
            position: "absolute",
            left: 1124,
            top: 352,
            ...MONOSPACE_FONT,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "0.01em",
            color: ARCH_PALETTE.accentBlueDeep,
            background: c.BACKGROUND_ELEVATED,
            border: `1.75px solid ${ARCH_PALETTE.accentBlue}`,
            borderRadius: 999,
            padding: "10px 22px",
            boxShadow: "0 10px 22px -8px rgba(29,78,216,0.38)",
            opacity:
              chipAtten *
              interpolate(
                frame,
                [pFanEdges.start + 30, pFanEdges.start + 90],
                [0, 1],
                { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              ),
          }}
        >
          routeNextStep()
        </div>

        {/* Dotted connector: execute_tools right edge (1108, 368) → chip
         *  left edge (1124, 368). Fades out as the Shiki panel enters so
         *  the right side of the canvas simplifies when code takes focus. */}
        <svg
          width={32}
          height={4}
          viewBox="0 0 32 4"
          style={{
            position: "absolute",
            left: 1108,
            top: 366,
            overflow: "visible",
            pointerEvents: "none",
            opacity: connectorOpacity,
          }}
        >
          <line
            x1={0}
            y1={2}
            x2={16}
            y2={2}
            stroke={ARCH_PALETTE.accentBlue}
            strokeDasharray="2 3"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>

        {/* One-shot halo at execute_tools on fan-out. */}
        <NodeHaloRing
          x={g.nodes.execute_tools.x}
          y={g.nodes.execute_tools.y}
          w={220}
          h={72}
          at={pFanEdges.start}
          durationFrames={36}
          color={ARCH_PALETTE.accentBlue}
        />
      </AbsoluteFill>

      {/*
        Right-side code cell — landing-page notebook aesthetic (rounded card
        with chrome strip + [N] badge + monospace body). Characters reveal
        linearly across 120f starting at pShiki.start + 36f (same cue
        timing the former MaskReveal wipe used). No caption below — the
        diagram already says "every phase uses this graph."
      */}
      <div
        style={{
          position: "absolute",
          left: g.shiki.x,
          top: g.shiki.y,
          width: g.shiki.w,
          opacity: interpolate(frame, [pShiki.start, pShiki.start + 36], [0, 1], {
            easing: EASE_OUT,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <CodeCellReveal
          code={SNIPPET_GRAPH_TS}
          lang="ts"
          filename="graph.ts"
          executionOrder={1}
          startFrame={pShiki.start + 36}
          durationFrames={120}
          fontSize={18}
        />
      </div>

      {/* State-reducer legend chips. */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 980,
          display: "flex",
          gap: 14,
          opacity: legendAtten,
        }}
      >
        {REDUCER_LEGEND.map((item, i) => (
          <div
            key={item.key}
            style={{
              ...MONOSPACE_FONT,
              fontSize: 13,
              padding: "8px 14px",
              background: c.BACKGROUND_ELEVATED,
              border: `1px solid ${ARCH_PALETTE.hairline}`,
              borderRadius: 6,
              opacity: legendItems[i]?.opacity ?? 0,
              transform: legendItems[i]?.transform,
              color: ARCH_PALETTE.ink,
            }}
          >
            <span style={{ color: ARCH_PALETTE.accentBlue }}>
              {item.key}
            </span>{" "}
            · <span style={{ color: ARCH_PALETTE.mute }}>{item.desc}</span>
          </div>
        ))}
      </div>

      {/* NDJSONTape (horizontal, lower-right quadrant). Appears at pTape. */}
      <div
        style={{
          position: "absolute",
          left: 1200,
          top: 960,
          width: 680,
          opacity:
            tapeAtten *
            interpolate(frame, [pTape.start, pTape.end], [0, 1], {
              easing: EASE_OUT,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
        }}
      >
        <NDJSONTape
          pills={NDJSON_EVENT_TYPES.slice(0, 4).map((type, i) => ({
            id: `${type}-${i}`,
            label: type,
            enterFrame: pTape.start + i * 20,
            color: i === 0 ? ARCH_PALETTE.accentBlue : ARCH_PALETTE.successGreen,
          }))}
          width={680}
          pillWidth={200}
        />
      </div>

      {/* Telemetry pill (bottom-right). Grouped with tape/caption so the
       *  three "data-rail" elements share the same attenuation trajectory. */}
      <div
        style={{
          position: "absolute",
          right: 96,
          bottom: 180,
          padding: "8px 14px",
          ...MONOSPACE_FONT,
          fontSize: 14,
          color: ARCH_PALETTE.ink,
          background: c.BACKGROUND_ELEVATED,
          border: `1px solid ${ARCH_PALETTE.hairline}`,
          borderRadius: 999,
          opacity: tapeAtten * (legendItems[2]?.opacity ?? 0),
        }}
      >
        1 graph · 3 phases · 29 stages
      </div>

      {/* Typewriter caption at footer right — ties to VO REDUCERS beat. */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 1020,
          ...MONOSPACE_FONT,
          fontSize: 14,
          color: ARCH_PALETTE.mute,
          opacity: tapeAtten * (legendItems[2]?.opacity ?? 0),
        }}
      >
        <TypeOnText
          text="State reducers merge turn-by-turn. No re-entry, no surprises."
          rate={LABEL_RATE}
          delay={pLegend.start + 100}
          caret={false}
        />
      </div>
    </SlideShell>
  );
};
