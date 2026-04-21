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
 * Layout is vertical: nodes flow top-to-bottom in a single centered column
 * so the poster-scale 28pt labels, typed-contract edge annotations, and the
 * approval-gate inset each get their own horizontal band instead of
 * fighting a cramped left-to-right chain. The auto-repair retry arc and the
 * amber revise arc swing out into the left/right channels where there's
 * room, and the tier legend drops to the footer.
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

// Design-space canvas. Portrait aspect so the 8-node stack has vertical
// room without crushing each node's 28pt label. DW tight to leave left and
// right channels (~220px each) for margin callouts and the approval-gate
// inset respectively.
const DW = 960;
// Extra vertical breathing room so the tier legend can sit well below the
// last node (`complete`) without superimposing on it — previously DH=920
// put the legend ~12px below the complete pill, which read as a collision
// at 150dpi.
const DH = 980;

const N_W = 260;
const N_H = 82;
const N_W_WIDE = 300; // wider for "await approval" and "commit / revise"

// Main column center — slightly left of canvas center so the right channel
// can host the approval-gate inset and retry arc without fighting the node
// stack.
const COL_CX = 340;
const NODE_X = COL_CX - N_W / 2;
const NODE_X_WIDE = COL_CX - N_W_WIDE / 2;

// Vertical rhythm: first node at y=60, step = 106 → tight but with enough
// inter-node runway for the typed-contract edge labels to sit on the
// connecting arrow without crowding either node.
const Y0 = 60;
const DY = 106;

const SHADOW = shadowIdFor("fsm");

// Per-node icon key — maps each FSM stage to an inline SVG glyph drawn
// inside the pill, left of the label. Icons are composed from primitive
// geometry (no external deps) so they carry over to PDF/print without
// font-glyph substitution. Strokes inherit `currentColor` from the pill's
// text color so deterministic/llm/action/human tiers all tint correctly.
type IconKey =
  | "context"   // document/file
  | "plan"      // clipboard/list
  | "generate"  // sparkle/wand
  | "execute"   // play/terminal chevron
  | "validate"  // shield+checkmark
  | "pause"     // pause bars (await_approval)
  | "fork"      // fork/split (commit/revise)
  | "checkCircle"; // check-in-circle (complete)

// Node layout — vertical stack. `commit/revise` lives between
// `await_approval` and `complete`; it's on the main spine, not a branch, so
// the core flow reads top-to-bottom as one continuous column.
const NODES: Array<NodeSpec & { icon: IconKey }> = [
  { id: "context",        label: "context",         sublabel: "read schema",        tier: "deterministic",  icon: "context",     x: NODE_X,      y: Y0 + 0 * DY, w: N_W,      h: N_H },
  { id: "plan",           label: "plan",            sublabel: "propose steps",      tier: "llm_delegated",  icon: "plan",        x: NODE_X,      y: Y0 + 1 * DY, w: N_W,      h: N_H },
  { id: "generate",       label: "generate",        sublabel: "write pandas",       tier: "llm_delegated",  icon: "generate",    x: NODE_X,      y: Y0 + 2 * DY, w: N_W,      h: N_H },
  { id: "execute",        label: "execute",         sublabel: "sandbox run",        tier: "action",         icon: "execute",     x: NODE_X,      y: Y0 + 3 * DY, w: N_W,      h: N_H },
  { id: "validate",       label: "validate",        sublabel: "schema · dtypes",    tier: "deterministic",  icon: "validate",    x: NODE_X,      y: Y0 + 4 * DY, w: N_W,      h: N_H },
  { id: "await_approval", label: "await approval",  sublabel: "human · the gate",   tier: "human_in_loop",  icon: "pause",       x: NODE_X_WIDE, y: Y0 + 5 * DY, w: N_W_WIDE, h: N_H },
  { id: "commit",         label: "commit / revise", sublabel: "persist or redo",    tier: "deterministic",  icon: "fork",        x: NODE_X_WIDE, y: Y0 + 6 * DY, w: N_W_WIDE, h: N_H },
  { id: "complete",       label: "complete",        sublabel: "stage signed off",   tier: "deterministic",  icon: "checkCircle", x: NODE_X,      y: Y0 + 7 * DY, w: N_W,      h: N_H },
];

// Inset panel — visualizes the approval-gate payload contract that the FSM
// sends to the UI every time it pauses. Anchored to the right channel,
// vertically centered on the await_approval node so the leader reads as a
// short hop rather than crossing the whole diagram. Kept in the same
// vertical band as the approval gate so the leader reads as a local zoom.
const INSET_W = 300;
const INSET_H = 170;
const INSET_X = DW - INSET_W - 26;
const INSET_Y = Y0 + 5 * DY - 44; // hugs await_approval vertically

// Payload contract as a monospace code block. Keys are fixed-width so the
// alignment reads as code; values call out the three fields the UI keys on.
const INSET_LINES: Array<{ key: string; value: string }> = [
  { key: "currentStage",     value: "\"await_approval\"" },
  { key: "approvalDecision", value: "\"pending\"" },
  { key: "requiresApproval", value: "true" },
];

// Time-cost annotations — a richness layer. Only the slower nodes get one,
// so the annotations read as signal (not decoration). Anchored to the LEFT
// edge of each node so they sit in the left channel alongside the node.
const TIME_COSTS: Record<string, string> = {
  plan:     "~1.2s",
  generate: "~12s",
  execute:  "~8s",
  validate: "~400ms",
};

export const PreprocessingFSM: React.FC<{
  width: number;
  height: number;
  color?: string;
  opacity?: number;
  /** When true, strips the payload inset, curly callouts, and tier legend so
   *  only nodes + edges remain. Used by the endpaper watermark (p02) so the
   *  diagram's backbone reads as a ghost without the supporting chrome. */
  watermark?: boolean;
}> = ({ width, height, color, opacity = 1, watermark = false }) => {
  const { nodeOf } = nodeMap(NODES);
  const sx = width / DW;
  const sy = height / DH;
  const s = Math.min(sx, sy);
  const offsetX = (width - DW * s) / 2;
  const offsetY = (height - DH * s) / 2;

  // Retry loop: validate.right → generate.right, swinging out into the
  // right channel. Peak far enough right that the auto-repair pill sits
  // clear of the node column, but close enough that it doesn't collide
  // with the approval-gate inset further right.
  const retryPath = (() => {
    const v = nodeOf("validate");
    const g = nodeOf("generate");
    const start = right(v);
    const end = right(g);
    const peakX = COL_CX + N_W / 2 + 150;
    return `M ${start.x} ${start.y} C ${peakX} ${start.y}, ${peakX} ${end.y}, ${end.x} ${end.y}`;
  })();

  // Revise path: commit.left → generate.left, swinging out into the LEFT
  // channel (dashed, amber) so the "redo" branch reads as a loop-back to
  // the LLM proposer. Arc peaks at x=150 — between the time-cost pill
  // column (46–104) and the node column (210+), so the dashed curve
  // threads cleanly without crossing either.
  const revisePath = (() => {
    const c = nodeOf("commit");
    const g = nodeOf("generate");
    const start = left(c);
    const end = left(g);
    const peakX = 150;
    return `M ${start.x} ${start.y} C ${peakX} ${start.y}, ${peakX} ${end.y}, ${end.x} ${end.y}`;
  })();

  // Sequential edges along the vertical spine.
  const pairs: Array<[string, string]> = [
    ["context", "plan"],
    ["plan", "generate"],
    ["generate", "execute"],
    ["execute", "validate"],
    ["validate", "await_approval"],
    ["await_approval", "commit"],
    ["commit", "complete"],
  ];

  // Dashed leader: await_approval right edge → inset left edge. Short
  // horizontal hop because the inset is anchored beside the gate.
  const leaderStart = (() => {
    const a = nodeOf("await_approval");
    return { x: a.x + a.w, y: a.y + a.h / 2 };
  })();
  const leaderEnd = { x: INSET_X, y: INSET_Y + INSET_H / 2 };
  const leaderPath = (() => {
    const midX = (leaderStart.x + leaderEnd.x) / 2;
    return `M ${leaderStart.x} ${leaderStart.y} C ${midX} ${leaderStart.y}, ${midX} ${leaderEnd.y}, ${leaderEnd.x} ${leaderEnd.y}`;
  })();

  // Typed-contract edge labels — small mono captions beside the connecting
  // lines to show what payload moves between stages. Rich without being
  // noisy: only three edges get labels (the ones where the contract shape
  // actually matters).
  const edgeLabels: Array<{ fromId: string; toId: string; text: string }> = [
    { fromId: "context", toId: "plan",     text: "{ datasetId, stepIndex }" },
    { fromId: "plan",    toId: "generate", text: "{ proposal: Step }" },
    { fromId: "execute", toId: "validate", text: "df[pre] → df[post]" },
  ];

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
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
        {/* Subtle top-to-bottom cream gradient for deterministic pills — gives
            each white pill a print-grade depth cue without introducing a
            new hex value. Stops use SURFACE and PAPER_ELEVATED tokens. */}
        <linearGradient id="fsm-grad-cream" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor={COLORS.SURFACE} />
        </linearGradient>
        {/* Warm amber gradient for the await_approval pill. */}
        <linearGradient id="fsm-grad-amber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FEF3C7" />
          <stop offset="100%" stopColor="#FDE68A" />
        </linearGradient>
      </defs>

      <g transform={`translate(${offsetX}, ${offsetY}) scale(${s})`}>
        {/* ===== EDGES ====================================================== */}
        <g fill="none" stroke={color ?? COLORS.INK} strokeWidth={2} strokeLinecap="round">
          {pairs.map(([fromId, toId]) => {
            const from = bottom(nodeOf(fromId));
            const to = top(nodeOf(toId));
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

        {/* Typed-contract edge labels — mono monospace, tucked beside the
            connecting line. Only drawn outside watermark mode because they
            read as captions, not structural lines. */}
        {!watermark && (
          <g>
            {edgeLabels.map(({ fromId, toId, text }) => {
              const from = bottom(nodeOf(fromId));
              const to = top(nodeOf(toId));
              const midY = (from.y + to.y) / 2 + 4;
              const labelX = from.x + 14;
              return (
                <text
                  key={`lbl-${fromId}-${toId}`}
                  x={labelX}
                  y={midY}
                  fontFamily={FONTS.MONO}
                  fontSize={13}
                  fontWeight={500}
                  fill={COLORS.INK_SUBTLE}
                  style={{ letterSpacing: "0.02em" }}
                >
                  {text}
                </text>
              );
            })}
          </g>
        )}

        {/* Time-cost annotations — small mono labels stuck to the LEFT edge
            of each slow node so they read as runtime budgets in the left
            channel, clear of the retry arc on the right. Pills sit well
            left of the revise arc path (which peaks at x≈140) so the
            dashed amber curve threads cleanly between them and the nodes. */}
        {!watermark && (
          <g>
            {NODES.filter((n) => TIME_COSTS[n.id]).map((n) => {
              const pillW = 58;
              const pillX = 46;
              return (
                <g key={`cost-${n.id}`}>
                  <rect
                    x={pillX}
                    y={n.y + n.h / 2 - 12}
                    width={pillW}
                    height={22}
                    rx={11}
                    fill={COLORS.PAPER}
                    stroke={COLORS.INK_SUBTLE}
                    strokeWidth={1}
                  />
                  <text
                    x={pillX + pillW / 2}
                    y={n.y + n.h / 2 + 4}
                    textAnchor="middle"
                    fontFamily={FONTS.MONO}
                    fontSize={12}
                    fontWeight={600}
                    fill={COLORS.INK}
                    style={{ letterSpacing: "0.04em" }}
                  >
                    {TIME_COSTS[n.id]}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Retry loop: validate → generate (accent arc) */}
        <g fill="none">
          <path
            d={retryPath}
            stroke={COLORS.ACCENT}
            strokeWidth={2.5}
            strokeLinecap="round"
            markerEnd="url(#fsm-arrow-accent)"
          />
          {/* Pill centered on the arc apex — matches the poster's
              `routeNextStep(state)` pattern with an accent-fill pill
              instead of floating text. */}
          {(() => {
            const peakX = COL_CX + N_W / 2 + 150;
            const midY = (nodeOf("validate").y + N_H / 2 + nodeOf("generate").y + N_H / 2) / 2;
            const pillW = 170;
            const pillH = 30;
            return (
              <g>
                <rect
                  x={peakX - pillW / 2}
                  y={midY - pillH / 2}
                  width={pillW}
                  height={pillH}
                  rx={pillH / 2}
                  fill={COLORS.ACCENT}
                  stroke={COLORS.ACCENT_DEEP}
                  strokeWidth={1.25}
                />
                <text
                  x={peakX}
                  y={midY + 4}
                  textAnchor="middle"
                  fontFamily={FONTS.MONO}
                  fontSize={12}
                  fontWeight={700}
                  fill="#FFFFFF"
                  style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  auto-repair · max 2
                </text>
              </g>
            );
          })()}
        </g>

        {/* Revise path (dashed amber loop back to generate, left channel) */}
        <g fill="none">
          <path
            d={revisePath}
            stroke={COLORS.AMBER}
            strokeWidth={2}
            strokeDasharray="6 5"
            strokeLinecap="round"
            markerEnd="url(#fsm-arrow-amber)"
          />
          {/* Pill on the dashed arrow apex — readable even when printed in
              grayscale because of the pill border. Widened to fit the full
              "REVISE · ROUTE BACK" caption without clipping the glyph cells. */}
          {(() => {
            const peakX = 150;
            // Pill sits low on the arc (between validate and await_approval
            // rows) so it's vertically offset from the `~400ms` pill on
            // validate and reads as a sibling annotation to the dashed arc.
            const midY = nodeOf("await_approval").y - 10;
            const pillW = 158;
            const pillH = 26;
            return (
              <g>
                <rect
                  x={peakX - pillW / 2}
                  y={midY - pillH / 2}
                  width={pillW}
                  height={pillH}
                  rx={pillH / 2}
                  fill={COLORS.PAPER}
                  stroke={COLORS.AMBER}
                  strokeWidth={1.5}
                />
                <text
                  x={peakX}
                  y={midY + 4}
                  textAnchor="middle"
                  fontFamily={FONTS.MONO}
                  fontSize={11}
                  fontWeight={700}
                  fill={COLORS.AMBER}
                  style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
                >
                  revise · route back
                </text>
              </g>
            );
          })()}
        </g>

        {/* ===== NODES ====================================================== */}
        {/* Each pill also gets a subtle linear gradient (cream → cream-darker)
            for depth — see `defs` for the gradient declarations. Icons sit
            to the LEFT of the label text, pre-centered so the label+icon
            group still reads visually middle-aligned inside the pill. */}
        {NODES.map((n) => {
          const st = tierStyle(n.tier);
          const cx = n.x + n.w / 2;
          const labelY = n.sublabel ? n.y + n.h / 2 - 4 : n.y + n.h / 2 + 10;
          const subY = n.y + n.h / 2 + 22;
          // Approximate label width from glyph count (26px sans bold avg ~15.5px per char).
          const labelGlyphW = 15.5;
          const labelW = n.label.length * labelGlyphW;
          const iconSize = 22;
          const iconGap = 10;
          const groupW = iconSize + iconGap + labelW;
          const iconX = cx - groupW / 2;
          const labelTextX = iconX + iconSize + iconGap + labelW / 2;
          const iconY = labelY - iconSize + 4;
          // Tier-specific surface: deterministic/human get gradient, action
          // (ink) and llm-delegated keep their flat fills so their visual
          // identity stays crisp.
          const useGradient = n.tier === "deterministic" || n.tier === "human_in_loop";
          const fill = useGradient
            ? n.tier === "human_in_loop"
              ? "url(#fsm-grad-amber)"
              : "url(#fsm-grad-cream)"
            : st.fill;
          return (
            <g key={n.id}>
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx={st.rx}
                ry={st.rx}
                fill={fill}
                stroke={st.stroke}
                strokeWidth={st.strokeWidth}
                strokeDasharray={st.strokeDasharray}
                filter={`url(#${SHADOW})`}
              />
              <NodeIcon
                kind={n.icon}
                x={iconX}
                y={iconY}
                size={iconSize}
                color={st.textFill}
              />
              <text
                x={labelTextX}
                y={labelY}
                textAnchor="middle"
                fontFamily={FONTS.SANS}
                fontSize={26}
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
                  fontSize={14}
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

        {/* Stage counters tucked INSIDE the top-left of each node. */}
        {NODES.map((n, i) => (
          <text
            key={`num-${n.id}`}
            x={n.x + 12}
            y={n.y + 18}
            textAnchor="start"
            fontFamily={FONTS.MONO}
            fontSize={11}
            fontWeight={700}
            fill={COLORS.INK_SUBTLE}
            style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}
          >
            {String(i + 1).padStart(2, "0")}
          </text>
        ))}

        {/* ===== ZOOM-IN INSET: approval-gate payload contract ============== */}
        {/* Suppressed in watermark mode so only the main flow's backbone
            reads on the endpaper page. */}
        {!watermark && (
          <g>
            {/* Dashed leader: await_approval → inset, short horizontal hop. */}
            <path
              d={leaderPath}
              stroke={COLORS.INK}
              strokeWidth={1.5}
              strokeDasharray="6 5"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx={leaderStart.x} cy={leaderStart.y} r={4} fill={COLORS.INK} />

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
              height={38}
              rx={14}
              ry={14}
              fill={COLORS.INK}
            />
            <rect
              x={INSET_X}
              y={INSET_Y + 24}
              width={INSET_W}
              height={14}
              fill={COLORS.INK}
            />
            <text
              x={INSET_X + 14}
              y={INSET_Y + 24}
              fontFamily={FONTS.SANS}
              fontSize={11}
              fontWeight={700}
              fill="#FFFFFF"
              style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              Approval-gate payload
            </text>
            <text
              x={INSET_X + INSET_W - 14}
              y={INSET_Y + 24}
              textAnchor="end"
              fontFamily={FONTS.MONO}
              fontSize={9}
              fontWeight={500}
              fill="rgba(255,255,255,0.72)"
              style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              snapshot
            </text>

            {/* Code-block body — each key/value row reads like a JSON entry. */}
            {INSET_LINES.map((line, i) => {
              const rowY = INSET_Y + 68 + i * 34;
              return (
                <g key={line.key}>
                  <text
                    x={INSET_X + 16}
                    y={rowY}
                    fontFamily={FONTS.MONO}
                    fontSize={13}
                    fontWeight={600}
                    fill={COLORS.ACCENT_DEEP}
                    style={{ letterSpacing: "0" }}
                  >
                    {line.key}
                  </text>
                  <text
                    x={INSET_X + INSET_W - 16}
                    y={rowY}
                    textAnchor="end"
                    fontFamily={FONTS.MONO}
                    fontSize={13}
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
        )}

        {/* ===== CURLY CALLOUTS (italic serif margin labels) ================ */}
        {/* Three hand-drawn-ish Bezier curves pointing into key nodes, with
            italic serif captions beside them. Built inline (not via the
            HandDrawnArrow HTML component) so everything lives in the SVG and
            scales with the rest of the diagram. */}

        {/* Watermark mode skips callouts + legend — only the main flow reads. */}
        {!watermark && (
          <g>
            {/* A — approval gate: "pauses until user commits or revises".
                Label sits BELOW the inset, right-aligned under it, with a
                short arc curling up into the inset's bottom edge. The
                callout points at the inset because the inset *is* the
                payload that appears when the gate pauses — so labeling the
                inset labels the gate's pause behavior. */}
            {(() => {
              const labelX = INSET_X + INSET_W;
              const labelY = INSET_Y + INSET_H + 28;
              const anchorX = INSET_X + INSET_W - 40;
              const anchorY = INSET_Y + INSET_H + 2;
              return (
                <CurlyCallout
                  path={`M ${labelX - 20} ${labelY - 14} C ${labelX - 50} ${labelY - 20}, ${anchorX + 10} ${anchorY + 10}, ${anchorX} ${anchorY}`}
                  labelX={labelX}
                  labelY={labelY}
                  labelAnchor="end"
                  text="pauses until user commits or revises"
                  color={COLORS.AMBER}
                />
              );
            })()}

            {/* B — retry loop: "common failures" annotation in the right
                channel, labeling the auto-repair arc. Label sits above the
                retry pill, curling down to touch the arc just above the
                validate node. */}
            {(() => {
              const peakX = COL_CX + N_W / 2 + 150;
              const pillY = (nodeOf("validate").y + N_H / 2 + nodeOf("generate").y + N_H / 2) / 2;
              return (
                <CurlyCallout
                  path={`M ${peakX + 90} ${pillY - 46} C ${peakX + 96} ${pillY - 30}, ${peakX + 92} ${pillY - 18}, ${peakX + 86} ${pillY - 12}`}
                  labelX={peakX + 90}
                  labelY={pillY - 54}
                  labelAnchor="start"
                  text="common failures: NaN · dtype · shape"
                  color={COLORS.ACCENT}
                />
              );
            })()}

            {/* C — entry node: typed contract note in the left channel,
                curling in from above-left into context's top-left corner.
                Placed above the node so it doesn't collide with the
                time-cost pill column. */}
            {(() => {
              const c = nodeOf("context");
              const anchorX = c.x + 14;
              const anchorY = c.y + 4;
              return (
                <CurlyCallout
                  path={`M ${anchorX - 140} ${anchorY - 36} C ${anchorX - 100} ${anchorY - 28}, ${anchorX - 60} ${anchorY - 14}, ${anchorX} ${anchorY}`}
                  labelX={anchorX - 146}
                  labelY={anchorY - 44}
                  labelAnchor="start"
                  text="deterministic entry · reads schema only"
                  color={COLORS.INK}
                />
              );
            })()}

            {/* ===== TIER LEGEND ============================================ */}
            {/* Legend baseline lives well below the `complete` node's bottom
                edge (y≈884). With DH=980, `y=DH-22=958` gives ~58px of
                vertical clearance from the last pill — reading as a clear
                caption band rather than competing for the same horizontal. */}
            <TierLegend centerX={DW / 2} y={DH - 22} />
          </g>
        )}
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
  const swatchW = 30;
  const swatchH = 18;
  const gapBetween = 28;
  const gapInside = 10;
  const charW = 8;
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
              rx={c.tier === "entry_end" ? swatchH / 2 : 4}
              fill={st.fill}
              stroke={st.stroke}
              strokeWidth={Math.min(st.strokeWidth, 2)}
              strokeDasharray={st.strokeDasharray}
            />
            <text
              x={x + swatchW + gapInside}
              y={y}
              fontFamily={FONTS.SANS}
              fontSize={13}
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

// ---------------------------------------------------------------------------
// NodeIcon — inline SVG glyph rendered inside each FSM pill, to the left of
// the node's label. All glyphs are drawn inside a 24×24 logical viewport
// and then scaled to the target `size`; paths use `currentColor` so they
// tint to match the pill's text color (ink / accent-deep / white / amber).
//
// Glyphs are hand-tuned lucide-inspired shapes (no icon package dependency
// required) so the FSM inherits no runtime cost from an icon lib and prints
// cleanly at 150–300dpi without font substitution risk.
// ---------------------------------------------------------------------------

type NodeIconProps = {
  kind: IconKey;
  x: number;
  y: number;
  size: number;
  color: string;
};

const NodeIcon: React.FC<NodeIconProps> = ({ kind, x, y, size, color }) => {
  const scale = size / 24;
  // Inline SVG glyph bodies — each glyph is authored inside a 24×24 box.
  const body = (() => {
    switch (kind) {
      case "context": // document with a folded corner + two content lines
        return (
          <g fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3 H15 L20 8 V21 H6 Z" />
            <path d="M15 3 V8 H20" />
            <line x1="9" y1="13" x2="17" y2="13" />
            <line x1="9" y1="17" x2="14" y2="17" />
          </g>
        );
      case "plan": // clipboard with three bullet lines
        return (
          <g fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="5" width="14" height="17" rx="2" />
            <path d="M9 3 H15 V6 H9 Z" fill={color} />
            <line x1="9" y1="12" x2="15" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
            <line x1="9" y1="18" x2="13" y2="18" />
          </g>
        );
      case "generate": // sparkle/wand — 4-point star + small star
        return (
          <g fill={color} stroke="none">
            <path d="M13 3 L14.6 9.4 L21 11 L14.6 12.6 L13 19 L11.4 12.6 L5 11 L11.4 9.4 Z" />
            <path d="M19 16 L19.6 18.4 L22 19 L19.6 19.6 L19 22 L18.4 19.6 L16 19 L18.4 18.4 Z" />
          </g>
        );
      case "execute": // terminal prompt (chevron + underscore)
        return (
          <g fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <polyline points="7,10 10,12 7,14" />
            <line x1="12.5" y1="15" x2="17" y2="15" />
          </g>
        );
      case "validate": // shield with check
        return (
          <g fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 L20 6 V12 C20 17 16 20 12 22 C8 20 4 17 4 12 V6 Z" />
            <polyline points="8.5,12 11,14.5 16,9.5" />
          </g>
        );
      case "pause": // two vertical bars (human_in_loop)
        return (
          <g fill={color} stroke="none">
            <rect x="7" y="5" width="4" height="14" rx="1.2" />
            <rect x="13" y="5" width="4" height="14" rx="1.2" />
          </g>
        );
      case "fork": // git-fork split (two circles + line + branch)
        return (
          <g fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="6" r="2.25" />
            <circle cx="17" cy="6" r="2.25" />
            <circle cx="12" cy="19" r="2.25" />
            <path d="M7 8.25 V12 C7 14 9 15 12 15 H12 C15 15 17 14 17 12 V8.25" />
            <line x1="12" y1="15" x2="12" y2="16.75" />
          </g>
        );
      case "checkCircle": // filled circle with inset check
        return (
          <g>
            <circle cx="12" cy="12" r="9" fill={color} />
            <polyline
              points="7.5,12 10.5,15 16.5,9"
              fill="none"
              stroke={color === "#FFFFFF" ? COLORS.INK : "#FFFFFF"}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
    }
  })();
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>{body}</g>
  );
};

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
      fontSize={17}
      fontWeight={400}
      fill={color}
      style={{ letterSpacing: "0.005em" }}
    >
      {text}
    </text>
  </g>
);
