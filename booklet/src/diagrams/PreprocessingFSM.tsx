import React from "react";
import { COLORS, FONTS } from "../theme";
import {
  type NodeSpec,
  type Tier,
  tierStyle,
  right,
  left,
  top,
  bottom,
  nodeMap,
  shadowIdFor,
} from "./primitives";

/**
 * 8-stage preprocessing finite state machine — page 17 hero.
 *
 * Stages:
 *   context → plan → generate → execute → validate →
 *   await_approval → commit/revise → complete
 *
 * The auto-repair retry loop runs from `validate` back to `generate` (up to
 * 2 retries before escalating). The approval gate (`await_approval`) is the
 * only human-in-loop node, and its payload contract is visualized as a
 * zoom-in inset on the right side of the diagram — mirroring the poster's
 * `execute_tools` zoom pattern.
 *
 * Typography / stroke / shadow tokens all trace back to the poster's
 * LangGraphDiagram so the three booklet INSIDE diagrams + the poster share
 * one visual system.
 */

// Design-space canvas. Widened to 1520 so `await approval` fits inside its
// node at 28pt without truncation, and the inset panel has its own column
// below the approval gate instead of fighting the main flow.
const DW = 1520;
const DH = 940;

const N_W = 196;
const N_H = 110;
const N_W_WIDE = 232; // wider for "await approval" and "commit / revise"

const SHADOW = shadowIdFor("fsm");

// Node layout — top row holds the 7 stages, `commit/revise` drops below the
// approval gate, and `complete` closes the chain on the right.
const NODES: NodeSpec[] = [
  { id: "context",        label: "context",        sublabel: "gather dataset ctx",      tier: "deterministic",  x: 24,   y: 230, w: N_W,      h: N_H },
  { id: "plan",           label: "plan",           sublabel: "propose step list",       tier: "llm_delegated",  x: 224,  y: 230, w: N_W,      h: N_H },
  { id: "generate",       label: "generate",       sublabel: "write pandas cells",      tier: "llm_delegated",  x: 424,  y: 230, w: N_W,      h: N_H },
  { id: "execute",        label: "execute",        sublabel: "sandbox · kernel gw",     tier: "action",         x: 624,  y: 230, w: N_W,      h: N_H },
  { id: "validate",       label: "validate",       sublabel: "schema · dtypes · nulls", tier: "deterministic",  x: 824,  y: 230, w: N_W,      h: N_H },
  { id: "await_approval", label: "await approval", sublabel: "human · the gate",        tier: "human_in_loop",  x: 1024, y: 230, w: N_W_WIDE, h: N_H },
  { id: "complete",       label: "complete",       sublabel: "stage signed off",        tier: "deterministic",  x: 1288, y: 230, w: N_W,      h: N_H },
  { id: "commit",         label: "commit / revise",sublabel: "persist or redo",         tier: "deterministic",  x: 1024, y: 480, w: N_W_WIDE, h: N_H },
];

// Inset panel — visualizes the approval-gate payload contract that the FSM
// sends to the UI every time it pauses. Anchored to the lower-left of the
// diagram (the `commit/revise` column is on the right, so the inset has a
// clear sightline to the approval gate).
const INSET_X = 120;
const INSET_Y = 610;
const INSET_W = 540;
const INSET_H = 220;

// Payload contract as a monospace code block. Keys are fixed-width so the
// alignment reads as code; values call out the three fields the UI keys on.
const INSET_LINES: Array<{ key: string; value: string; comment?: string }> = [
  { key: "currentStage",     value: "\"await_approval\"" },
  { key: "approvalDecision", value: "\"pending\"" },
  { key: "requiresApproval", value: "true" },
];

export const PreprocessingFSM: React.FC<{
  width: number;
  height: number;
  color?: string;
  opacity?: number;
}> = ({ width, height, color, opacity = 1 }) => {
  const { nodeOf } = nodeMap(NODES);
  const sx = width / DW;
  const sy = height / DH;
  const s = Math.min(sx, sy);
  const offsetX = (width - DW * s) / 2;
  const offsetY = (height - DH * s) / 2;

  // Retry loop: validate → generate, curving up+over.
  const retryPath = (() => {
    const v = nodeOf("validate");
    const g = nodeOf("generate");
    const start = top(v);
    const end = top(g);
    const peakY = Math.min(start.y, end.y) - 96;
    return `M ${start.x} ${start.y} C ${start.x} ${peakY}, ${end.x} ${peakY}, ${end.x} ${end.y}`;
  })();

  // Commit path: await_approval.bottom → commit.top (down arrow).
  const commitPath = (() => {
    const a = nodeOf("await_approval");
    const c = nodeOf("commit");
    const start = bottom(a);
    const end = top(c);
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  })();

  // Revise path: commit.left → generate.bottom (loops back under main row).
  const revisePath = (() => {
    const c = nodeOf("commit");
    const g = nodeOf("generate");
    const start = left(c);
    const end = bottom(g);
    const midY = start.y + 24;
    return `M ${start.x} ${start.y} C ${start.x - 60} ${midY}, ${end.x + 80} ${midY}, ${end.x} ${end.y}`;
  })();

  // Sequential edges along the top row.
  const pairs: Array<[string, string]> = [
    ["context", "plan"],
    ["plan", "generate"],
    ["generate", "execute"],
    ["execute", "validate"],
    ["validate", "await_approval"],
    ["await_approval", "complete"],
  ];

  // Dashed leader from await_approval bottom → inset panel top-right.
  const leaderStart = (() => {
    const a = nodeOf("await_approval");
    return { x: a.x + 20, y: a.y + a.h };
  })();
  const leaderEnd = { x: INSET_X + INSET_W - 40, y: INSET_Y };

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="geometricPrecision"
      style={{ display: "block", opacity, color: color ?? COLORS.INK }}
    >
      <defs>
        {(["ink", "accent", "amber"] as const).map((k) => (
          <marker
            key={k}
            id={`fsm-arrow-${k}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 Z"
              fill={k === "ink" ? (color ?? COLORS.INK) : k === "accent" ? COLORS.ACCENT : COLORS.AMBER}
            />
          </marker>
        ))}
        <filter id={SHADOW} x="-10%" y="-10%" width="120%" height="160%">
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="3"
            floodColor={COLORS.INK}
            floodOpacity="0.12"
          />
        </filter>
      </defs>

      <g transform={`translate(${offsetX}, ${offsetY}) scale(${s})`}>
        {/* ===== EDGES ====================================================== */}
        <g fill="none" stroke={color ?? COLORS.INK} strokeWidth={2} strokeLinecap="round">
          {pairs.map(([fromId, toId]) => {
            const from = right(nodeOf(fromId));
            const to = left(nodeOf(toId));
            return (
              <line
                key={`${fromId}->${toId}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                markerEnd="url(#fsm-arrow-ink)"
              />
            );
          })}
        </g>

        {/* Retry loop: validate → generate (accent arc) */}
        <g fill="none">
          <path
            d={retryPath}
            stroke={COLORS.ACCENT}
            strokeWidth={2.5}
            strokeLinecap="round"
            markerEnd="url(#fsm-arrow-accent)"
          />
          <text
            x={(nodeOf("validate").x + nodeOf("generate").x) / 2 + N_W / 2}
            y={112}
            textAnchor="middle"
            fontFamily={FONTS.MONO}
            fontSize={20}
            fontWeight={700}
            fill={COLORS.ACCENT}
            style={{ letterSpacing: "0.02em" }}
          >
            auto-repair · max 2
          </text>
        </g>

        {/* Commit path (amber arrow down from approval gate) */}
        <g fill="none">
          <path
            d={commitPath}
            stroke={COLORS.AMBER}
            strokeWidth={2.5}
            strokeLinecap="round"
            markerEnd="url(#fsm-arrow-amber)"
          />
        </g>

        {/* Revise path (dashed amber loop back to generate) */}
        <g fill="none">
          <path
            d={revisePath}
            stroke={COLORS.AMBER}
            strokeWidth={2}
            strokeDasharray="6 5"
            strokeLinecap="round"
            markerEnd="url(#fsm-arrow-amber)"
          />
          <text
            x={nodeOf("commit").x - 40}
            y={nodeOf("commit").y + 40}
            textAnchor="end"
            fontFamily={FONTS.MONO}
            fontSize={18}
            fontWeight={700}
            fill={COLORS.AMBER}
            style={{ letterSpacing: "0.02em" }}
          >
            revise · route back
          </text>
        </g>

        {/* ===== NODES ====================================================== */}
        {NODES.map((n) => {
          const st = tierStyle(n.tier);
          const cx = n.x + n.w / 2;
          const labelY = n.sublabel ? n.y + n.h / 2 - 4 : n.y + n.h / 2 + 10;
          const subY = n.y + n.h / 2 + 26;
          return (
            <g key={n.id}>
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx={st.rx}
                ry={st.rx}
                fill={st.fill}
                stroke={st.stroke}
                strokeWidth={st.strokeWidth}
                strokeDasharray={st.strokeDasharray}
                filter={`url(#${SHADOW})`}
              />
              <text
                x={cx}
                y={labelY}
                textAnchor="middle"
                fontFamily={FONTS.SANS}
                fontSize={28}
                fontWeight={700}
                fill={st.textFill}
                style={{ letterSpacing: "-0.01em" }}
              >
                {n.label}
              </text>
              {n.sublabel && (
                <text
                  x={cx}
                  y={subY}
                  textAnchor="middle"
                  fontFamily={FONTS.MONO}
                  fontSize={16}
                  fontWeight={500}
                  fill={st.subFill}
                  style={{ letterSpacing: "0.01em" }}
                >
                  {n.sublabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Stage counters above each top-row node (01…07) */}
        {NODES.filter((n) => n.y === 230).map((n, i) => (
          <text
            key={`num-${n.id}`}
            x={n.x + n.w / 2}
            y={n.y - 18}
            textAnchor="middle"
            fontFamily={FONTS.MONO}
            fontSize={14}
            fontWeight={700}
            fill={COLORS.INK_MUTED}
            style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}
          >
            {String(i + 1).padStart(2, "0")}
          </text>
        ))}

        {/* Stage counter for the commit node (sits under it) */}
        <text
          x={nodeOf("commit").x + nodeOf("commit").w / 2}
          y={nodeOf("commit").y + N_H + 28}
          textAnchor="middle"
          fontFamily={FONTS.MONO}
          fontSize={14}
          fontWeight={700}
          fill={COLORS.INK_MUTED}
          style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}
        >
          08
        </text>

        {/* ===== ZOOM-IN INSET: approval-gate payload contract ============== */}
        {/* Dashed leader from await_approval.bottom → inset top-left */}
        <line
          x1={leaderStart.x}
          y1={leaderStart.y}
          x2={leaderEnd.x}
          y2={leaderEnd.y}
          stroke={COLORS.INK}
          strokeWidth={1.5}
          strokeDasharray="6 5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx={leaderStart.x} cy={leaderStart.y} r={4} fill={COLORS.INK} />

        <g>
          <rect
            x={INSET_X}
            y={INSET_Y}
            width={INSET_W}
            height={INSET_H}
            rx={14}
            ry={14}
            fill={COLORS.PAPER}
            stroke={COLORS.INK}
            strokeWidth={2}
            filter={`url(#${SHADOW})`}
          />
          {/* Header strip */}
          <rect
            x={INSET_X}
            y={INSET_Y}
            width={INSET_W}
            height={46}
            rx={14}
            ry={14}
            fill={COLORS.INK}
          />
          <rect
            x={INSET_X}
            y={INSET_Y + 32}
            width={INSET_W}
            height={14}
            fill={COLORS.INK}
          />
          <text
            x={INSET_X + 18}
            y={INSET_Y + 30}
            fontFamily={FONTS.SANS}
            fontSize={15}
            fontWeight={700}
            fill="#FFFFFF"
            style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            Approval-gate payload
          </text>
          <text
            x={INSET_X + INSET_W - 18}
            y={INSET_Y + 30}
            textAnchor="end"
            fontFamily={FONTS.MONO}
            fontSize={12}
            fontWeight={500}
            fill="rgba(255,255,255,0.72)"
            style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            state snapshot
          </text>

          {/* Code-block body — each key/value row reads like a JSON entry. */}
          {INSET_LINES.map((line, i) => {
            const rowY = INSET_Y + 78 + i * 38;
            return (
              <g key={line.key}>
                <text
                  x={INSET_X + 26}
                  y={rowY}
                  fontFamily={FONTS.MONO}
                  fontSize={20}
                  fontWeight={600}
                  fill={COLORS.ACCENT_DEEP}
                  style={{ letterSpacing: "0" }}
                >
                  {line.key}
                </text>
                <text
                  x={INSET_X + 290}
                  y={rowY}
                  fontFamily={FONTS.MONO}
                  fontSize={20}
                  fontWeight={600}
                  fill={COLORS.INK}
                  style={{ letterSpacing: "0" }}
                >
                  {line.value}
                </text>
              </g>
            );
          })}
        </g>

        {/* ===== CURLY CALLOUTS (italic serif margin labels) ================ */}
        {/* Three hand-drawn-ish Bezier curves pointing into key nodes, with
            italic serif captions beside them. Built inline (not via the
            HandDrawnArrow HTML component) so everything lives in the SVG and
            scales with the rest of the diagram. */}

        {/* A — approval gate: "pauses until user commits or revises" */}
        <CurlyCallout
          path={`M ${nodeOf("await_approval").x + N_W / 2 + 20} ${nodeOf("await_approval").y - 40} C ${nodeOf("await_approval").x + N_W + 90} ${nodeOf("await_approval").y - 80}, ${nodeOf("await_approval").x + N_W + 160} ${nodeOf("await_approval").y - 40}, ${nodeOf("await_approval").x + N_W + 180} ${nodeOf("await_approval").y + 8}`}
          labelX={nodeOf("await_approval").x + N_W + 24}
          labelY={nodeOf("await_approval").y - 80}
          labelAnchor="start"
          text="pauses until user commits or revises"
          color={COLORS.AMBER}
        />

        {/* B — retry loop: "max 2 retries · then escalate" */}
        <CurlyCallout
          path={`M ${nodeOf("generate").x - 40} ${nodeOf("generate").y - 40} C ${nodeOf("generate").x - 120} ${nodeOf("generate").y - 90}, ${nodeOf("generate").x - 60} ${nodeOf("generate").y - 130}, ${nodeOf("generate").x + 30} ${nodeOf("generate").y - 100}`}
          labelX={nodeOf("generate").x - 220}
          labelY={nodeOf("generate").y - 40}
          labelAnchor="start"
          text="max 2 retries · then escalate"
          color={COLORS.ACCENT}
        />

        {/* C — entry node: "typed contract: {datasetId, stepIndex}" */}
        <CurlyCallout
          path={`M ${nodeOf("context").x + 60} ${nodeOf("context").y + N_H + 40} C ${nodeOf("context").x + 40} ${nodeOf("context").y + N_H + 90}, ${nodeOf("context").x + 120} ${nodeOf("context").y + N_H + 100}, ${nodeOf("context").x + N_W / 2} ${nodeOf("context").y + N_H + 8}`}
          labelX={nodeOf("context").x - 10}
          labelY={nodeOf("context").y + N_H + 128}
          labelAnchor="start"
          text="typed contract: { datasetId, stepIndex }"
          color={COLORS.INK}
        />

        {/* ===== TIER LEGEND ================================================ */}
        <TierLegend centerX={DW / 2} y={DH - 30} />
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Tier legend — 5 swatches + italic serif margin labels, centered below the
// main flow. Matches the poster's LangGraphDiagram legend in spirit; kept
// slightly smaller so it reads as a supporting caption rather than
// competing with the top-row nodes.
// ---------------------------------------------------------------------------

const LEGEND_ITEMS: Array<{ tier: Tier; label: string }> = [
  { tier: "entry_end",      label: "entry / end" },
  { tier: "deterministic",  label: "deterministic" },
  { tier: "llm_delegated",  label: "llm-delegated" },
  { tier: "action",         label: "action" },
  { tier: "human_in_loop",  label: "human-in-loop" },
];

const TierLegend: React.FC<{ centerX: number; y: number }> = ({ centerX, y }) => {
  const swatchW = 36;
  const swatchH = 22;
  const gapBetween = 44;
  const gapInside = 12;
  const charW = 10;
  const widths = LEGEND_ITEMS.map(
    (c) => swatchW + gapInside + c.label.length * charW,
  );
  const totalW =
    widths.reduce((a, b) => a + b, 0) + gapBetween * (LEGEND_ITEMS.length - 1);
  let cursor = centerX - totalW / 2;
  return (
    <g>
      {LEGEND_ITEMS.map((c, i) => {
        const st = tierStyle(c.tier);
        const x = cursor;
        const swatchY = y - swatchH + 6;
        const node = (
          <g key={c.tier}>
            <rect
              x={x}
              y={swatchY}
              width={swatchW}
              height={swatchH}
              rx={c.tier === "entry_end" ? swatchH / 2 : 5}
              fill={st.fill}
              stroke={st.stroke}
              strokeWidth={Math.min(st.strokeWidth, 2)}
              strokeDasharray={st.strokeDasharray}
            />
            <text
              x={x + swatchW + gapInside}
              y={y}
              fontFamily={FONTS.SANS}
              fontSize={16}
              fontWeight={600}
              fill={COLORS.INK}
              style={{ letterSpacing: "0.01em" }}
            >
              {c.label}
            </text>
          </g>
        );
        cursor += (widths[i] ?? 0) + gapBetween;
        return node;
      })}
    </g>
  );
};

// ---------------------------------------------------------------------------
// Curly callout — a single cubic Bezier path with a short arrowhead and an
// italic serif caption. Used three times to annotate the FSM with margin
// notes that read like a reviewer's pencil marks.
// ---------------------------------------------------------------------------

const CurlyCallout: React.FC<{
  path: string;
  labelX: number;
  labelY: number;
  labelAnchor: "start" | "middle" | "end";
  text: string;
  color: string;
}> = ({ path, labelX, labelY, labelAnchor, text, color }) => (
  <g>
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.75}
    />
    <text
      x={labelX}
      y={labelY}
      textAnchor={labelAnchor}
      fontFamily={FONTS.SERIF}
      fontStyle="italic"
      fontSize={20}
      fontWeight={400}
      fill={color}
      style={{ letterSpacing: "0.005em" }}
    >
      {text}
    </text>
  </g>
);
