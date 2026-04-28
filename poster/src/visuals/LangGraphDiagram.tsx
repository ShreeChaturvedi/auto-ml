import React from "react";
import { COLORS, FONTS } from "../tokens";

/**
 * LangGraph runtime diagram, rendered as a single root <svg> for crisp print
 * output (no sub-pixel CSS-div connectors, no jagged hairlines).
 *
 * Mirrors the FSM in `backend/src/services/workflows/graph.ts`:
 *
 *   START → prepare → invoke_model ⇄ execute_tools
 *                          │
 *                          ├─▶ pause     ─▶ END
 *                          ├─▶ complete  ─▶ END
 *                          └─▶ fail      ─▶ END
 *
 * A magnified inset hangs off `execute_tools` and shows a representative
 * slice of the STAGE_TOOL_ALLOWLIST so the "action" node reads as something
 * concrete rather than an abstract box.
 *
 * Tiers (mirrors runtime semantics):
 *   • deterministic   prepare, complete, fail
 *   • llm_delegated   invoke_model
 *   • action          execute_tools
 *   • human_in_loop   pause
 *   • entry / end     START, END (small pills)
 */

type Tier =
  | "entry_end"
  | "deterministic"
  | "llm_delegated"
  | "action"
  | "human_in_loop";

type NodeSpec = {
  id: string;
  label: string;
  sublabel?: string;
  tier: Tier;
  x: number;
  y: number;
  w: number;
  h: number;
};

// --- design canvas -----------------------------------------------------------

const DW = 1400;
const DH = 900;

// Shared shadow filter id — applied to every node for a subtle lift.
const SHADOW_ID = "lg-node-shadow";

// --- tier styling ------------------------------------------------------------

type TierStyle = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  textFill: string;
  subFill: string;
  rx: number;
};

const tierStyle = (tier: Tier): TierStyle => {
  switch (tier) {
    case "entry_end":
      return {
        fill: COLORS.SURFACE,
        stroke: COLORS.HAIRLINE_STRONG,
        strokeWidth: 2,
        textFill: COLORS.INK,
        subFill: COLORS.INK_MUTED,
        rx: 999,
      };
    case "deterministic":
      return {
        fill: "#FFFFFF",
        stroke: COLORS.INK,
        strokeWidth: 2,
        textFill: COLORS.INK,
        subFill: COLORS.INK_MUTED,
        rx: 14,
      };
    case "llm_delegated":
      return {
        fill: "#FFFFFF",
        stroke: COLORS.ACCENT,
        strokeWidth: 2,
        strokeDasharray: "5 4",
        textFill: COLORS.ACCENT_DEEP,
        subFill: COLORS.INK_MUTED,
        rx: 14,
      };
    case "action":
      return {
        fill: COLORS.INK,
        stroke: COLORS.INK,
        strokeWidth: 2.5,
        textFill: "#FFFFFF",
        subFill: "rgba(255,255,255,0.72)",
        rx: 14,
      };
    case "human_in_loop":
      return {
        fill: "#FEF3C7",
        stroke: "#D97706",
        strokeWidth: 2,
        textFill: "#92400E",
        subFill: "#92400E",
        rx: 14,
      };
  }
};

// --- node geometry -----------------------------------------------------------

const N_W = 230;
const N_W_WIDE = 270; // wider for nodes whose sublabel overflows (invoke_model)
const N_H = 112;
const N_H_TALL = 138; // hubs (invoke_model, execute_tools)
const PILL_W = 128;
const PILL_H = 66;

// Coordinates use top-left of each node. Layout spreads horizontally so the
// arrows between nodes are long enough to read as directional connectors at
// poster scale, while still leaving the zoom-in panel on the right room to
// breathe without colliding with the fail column.
const NODES: NodeSpec[] = [
  { id: "start",         label: "START",         tier: "entry_end",                                          x: 100 - PILL_W / 2, y: 240 - PILL_H / 2,   w: PILL_W,    h: PILL_H },
  { id: "prepare",       label: "prepare",       sublabel: "build phase request",    tier: "deterministic",  x: 340 - N_W / 2,    y: 240 - N_H / 2,      w: N_W,       h: N_H },
  { id: "invoke_model",  label: "invoke_model",  sublabel: "ChatOpenAI · tool-call", tier: "llm_delegated",  x: 640 - N_W_WIDE / 2, y: 240 - N_H_TALL / 2, w: N_W_WIDE, h: N_H_TALL },
  { id: "execute_tools", label: "execute_tools", sublabel: "allow-listed tools",     tier: "action",         x: 950 - N_W / 2,    y: 240 - N_H_TALL / 2, w: N_W,       h: N_H_TALL },
  { id: "pause",         label: "pause",         sublabel: "human-in-loop",          tier: "human_in_loop",  x: 320 - N_W / 2,    y: 560 - N_H / 2,      w: N_W,       h: N_H },
  { id: "complete",      label: "complete",      sublabel: "register results",       tier: "deterministic",  x: 640 - N_W / 2,    y: 560 - N_H / 2,      w: N_W,       h: N_H },
  { id: "fail",          label: "fail",          sublabel: "surface error",          tier: "deterministic",  x: 960 - N_W / 2,    y: 560 - N_H / 2,      w: N_W,       h: N_H },
  { id: "end",           label: "END",           tier: "entry_end",                                          x: 640 - PILL_W / 2, y: 760 - PILL_H / 2,   w: PILL_W,    h: PILL_H },
];

const nMap: Record<string, NodeSpec> = NODES.reduce(
  (acc, n) => {
    acc[n.id] = n;
    return acc;
  },
  {} as Record<string, NodeSpec>,
);

function nodeOf(id: string): NodeSpec {
  const n = nMap[id];
  if (!n) throw new Error(`unknown node: ${id}`);
  return n;
}

// Anchor helpers -------------------------------------------------------------

const right = (n: NodeSpec) => ({ x: n.x + n.w, y: n.y + n.h / 2 });
const left = (n: NodeSpec) => ({ x: n.x, y: n.y + n.h / 2 });
const top = (n: NodeSpec) => ({ x: n.x + n.w / 2, y: n.y });
const bottom = (n: NodeSpec) => ({ x: n.x + n.w / 2, y: n.y + n.h });

// ---------------------------------------------------------------------------
// Zoom-in "magnified inset" — a palette-style panel that shows a handful of
// real tool names from STAGE_TOOL_ALLOWLIST. Sits to the right of
// `execute_tools` and connects back to it with a dashed leader line, so it
// reads as "what's inside this node".
// ---------------------------------------------------------------------------

// Lucide icon path data — inlined so we don't pull lucide-react as a
// dependency. Each entry is the raw <path>/<rect>/<circle>/<polyline>
// children of the lucide SVG (24×24 viewBox, stroke-based). Rendered inside
// a 22×22 container with stroke-width 1.75, round caps/joins, currentColor.
// Sourced from lucide.dev (MIT licensed), frozen at the time of writing.
type ToolIconId =
  | "database"
  | "file-text"
  | "pencil"
  | "play"
  | "list-todo"
  | "shield-check";

const LUCIDE_ICONS: Record<ToolIconId, React.ReactNode> = {
  // Database — https://lucide.dev/icons/database
  database: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </>
  ),
  // FileText — https://lucide.dev/icons/file-text
  "file-text": (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </>
  ),
  // Pencil — https://lucide.dev/icons/pencil
  pencil: (
    <>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </>
  ),
  // Play — https://lucide.dev/icons/play
  play: (
    <>
      <polygon points="6 3 20 12 6 21 6 3" />
    </>
  ),
  // ListTodo — https://lucide.dev/icons/list-todo
  "list-todo": (
    <>
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </>
  ),
  // ShieldCheck — https://lucide.dev/icons/shield-check
  "shield-check": (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

type ZoomTool = { name: string; icon: ToolIconId };

const ZOOM_TOOLS: ZoomTool[] = [
  { name: "get_dataset_profile", icon: "database" },
  { name: "read_cell",           icon: "file-text" },
  { name: "edit_cell",           icon: "pencil" },
  { name: "run_notebook_cell",   icon: "play" },
  { name: "propose_plan",        icon: "list-todo" },
  { name: "request_approval",    icon: "shield-check" },
];

// Panel rectangle in design space. Sized so the full "Allow-listed tools"
// header (magnifier + label) reads on one row without truncation, and so
// the tool names fit comfortably in each chip with a lucide icon slot.
const ZOOM_X = 1130;
const ZOOM_Y = 90;
const ZOOM_W = 268;
const ZOOM_H = 356;

// ---------------------------------------------------------------------------

export const LangGraphDiagram: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {
  const sx = width / DW;
  const sy = height / DH;
  const s = Math.min(sx, sy);

  // Center the scaled canvas inside the bounding box.
  const offsetX = (width - DW * s) / 2;
  const offsetY = (height - DH * s) / 2;

  // Edge geometry -----------------------------------------------------------
  // All edges are drawn from anchor → anchor with explicit endpoints, so the
  // marker arrowhead lands cleanly on the node border.

  const startAnchor = right(nodeOf("start"));
  const prepareLeft = left(nodeOf("prepare"));
  const prepareRight = right(nodeOf("prepare"));
  const invokeLeft = left(nodeOf("invoke_model"));
  const invokeRight = right(nodeOf("invoke_model"));
  const invokeBottom = bottom(nodeOf("invoke_model"));
  const executeLeft = left(nodeOf("execute_tools"));
  const executeTop = top(nodeOf("execute_tools"));
  const invokeTop = top(nodeOf("invoke_model"));
  const pauseTop = top(nodeOf("pause"));
  const pauseBottom = bottom(nodeOf("pause"));
  const completeTop = top(nodeOf("complete"));
  const completeBottom = bottom(nodeOf("complete"));
  const failTop = top(nodeOf("fail"));
  const failBottom = bottom(nodeOf("fail"));
  const endTop = top(nodeOf("end"));
  const endLeft = left(nodeOf("end"));
  const endRight = right(nodeOf("end"));

  // Loop-back arc: execute_tools.top → invoke_model.top, curving up+over.
  const loopPeakY = Math.min(invokeTop.y, executeTop.y) - 88;
  const loopPath = `M ${executeTop.x} ${executeTop.y} C ${executeTop.x} ${loopPeakY}, ${invokeTop.x} ${loopPeakY}, ${invokeTop.x} ${invokeTop.y}`;

  // routeNextStep pill — sits above the loop-back arc, with a short tick
  // dropping down to meet the arc apex.
  const horizMidX = (invokeRight.x + executeLeft.x) / 2;

  // Leader line from execute_tools → zoom inset (dashed).
  const executeNode = nodeOf("execute_tools");
  const executeRight = right(executeNode);
  const zoomLeaderStart = { x: executeRight.x + 4, y: executeRight.y };
  const zoomLeaderEnd = { x: ZOOM_X, y: ZOOM_Y + 44 };

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="geometricPrecision"
      style={{ display: "block" }}
    >
      <defs>
        <marker
          id="lg-arrow-ink"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill={COLORS.INK} />
        </marker>
        <marker
          id="lg-arrow-accent"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill={COLORS.ACCENT} />
        </marker>
        {/* Subtle drop shadow used on every node for a paper-lift feel. */}
        <filter
          id={SHADOW_ID}
          x="-10%"
          y="-10%"
          width="120%"
          height="140%"
        >
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
        <g
          fill="none"
          stroke={COLORS.INK}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* START → prepare */}
          <line
            x1={startAnchor.x}
            y1={startAnchor.y}
            x2={prepareLeft.x}
            y2={prepareLeft.y}
            markerEnd="url(#lg-arrow-ink)"
          />
          {/* prepare → invoke_model */}
          <line
            x1={prepareRight.x}
            y1={prepareRight.y}
            x2={invokeLeft.x}
            y2={invokeLeft.y}
            markerEnd="url(#lg-arrow-ink)"
          />
          {/* invoke_model → execute_tools */}
          <line
            x1={invokeRight.x}
            y1={invokeRight.y}
            x2={executeLeft.x}
            y2={executeLeft.y}
            markerEnd="url(#lg-arrow-ink)"
          />
          {/* execute_tools → invoke_model (loop-back arc, accent) */}
          <path
            d={loopPath}
            stroke={COLORS.ACCENT}
            strokeWidth={2.5}
            markerEnd="url(#lg-arrow-accent)"
          />
          {/* invoke_model → pause (diagonal down-left) */}
          <line
            x1={invokeBottom.x}
            y1={invokeBottom.y}
            x2={pauseTop.x}
            y2={pauseTop.y}
            markerEnd="url(#lg-arrow-ink)"
          />
          {/* invoke_model → complete (vertical down) */}
          <line
            x1={invokeBottom.x}
            y1={invokeBottom.y}
            x2={completeTop.x}
            y2={completeTop.y}
            markerEnd="url(#lg-arrow-ink)"
          />
          {/* invoke_model → fail (diagonal down-right) */}
          <line
            x1={invokeBottom.x}
            y1={invokeBottom.y}
            x2={failTop.x}
            y2={failTop.y}
            markerEnd="url(#lg-arrow-ink)"
          />
          {/* pause → END (diagonal down-right) */}
          <line
            x1={pauseBottom.x}
            y1={pauseBottom.y}
            x2={endLeft.x}
            y2={endLeft.y}
            markerEnd="url(#lg-arrow-ink)"
          />
          {/* complete → END (vertical down) */}
          <line
            x1={completeBottom.x}
            y1={completeBottom.y}
            x2={endTop.x}
            y2={endTop.y}
            markerEnd="url(#lg-arrow-ink)"
          />
          {/* fail → END (diagonal down-left) */}
          <line
            x1={failBottom.x}
            y1={failBottom.y}
            x2={endRight.x}
            y2={endRight.y}
            markerEnd="url(#lg-arrow-ink)"
          />
        </g>

        {/* routeNextStep pill (accent) — labels the conditional branching
            from invoke_model. Sits above the loop arc, filled with accent
            blue and white text so it reads as a first-class annotation. A
            short tick drops from its bottom edge to the loop-back apex. */}
        {(() => {
          const pillW = 260;
          const pillH = 44;
          const pillCx = horizMidX;
          const pillCy = loopPeakY - 36;
          const pillX = pillCx - pillW / 2;
          const pillY = pillCy - pillH / 2;
          const tickTop = pillCy + pillH / 2;
          const tickBot = loopPeakY - 2;
          return (
            <g>
              {/* tick from pill bottom to loop arc apex */}
              <line
                x1={pillCx}
                y1={tickTop}
                x2={pillCx}
                y2={tickBot}
                stroke={COLORS.ACCENT}
                strokeWidth={2}
                strokeLinecap="round"
              />
              <rect
                x={pillX}
                y={pillY}
                width={pillW}
                height={pillH}
                rx={pillH / 2}
                fill={COLORS.ACCENT}
                stroke={COLORS.ACCENT_DEEP}
                strokeWidth={1.5}
                filter={`url(#${SHADOW_ID})`}
              />
              <text
                x={pillCx}
                y={pillCy + 7}
                textAnchor="middle"
                fontFamily={FONTS.MONO}
                fontSize={20}
                fontWeight={700}
                fill="#FFFFFF"
                style={{ letterSpacing: "0.01em" }}
              >
                routeNextStep(state)
              </text>
            </g>
          );
        })()}

        {/* ===== NODES ====================================================== */}
        {NODES.map((n) => {
          const st = tierStyle(n.tier);
          const isPill = n.tier === "entry_end";
          const labelSize = isPill ? 26 : 28;
          const labelTracking = isPill ? "0.16em" : "-0.005em";
          const labelTransform = isPill ? "uppercase" : "none";
          const cx = n.x + n.w / 2;
          const labelY = n.sublabel ? n.y + n.h / 2 - 4 : n.y + n.h / 2 + 8;
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
                filter={`url(#${SHADOW_ID})`}
              />
              <text
                x={cx}
                y={labelY}
                textAnchor="middle"
                fontFamily={FONTS.SANS}
                fontSize={labelSize}
                fontWeight={700}
                fill={st.textFill}
                style={{
                  letterSpacing: labelTracking,
                  textTransform: labelTransform as "uppercase" | "none",
                }}
              >
                {n.label}
              </text>
              {n.sublabel && (
                <text
                  x={cx}
                  y={subY}
                  textAnchor="middle"
                  fontFamily={FONTS.MONO}
                  fontSize={18}
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

        {/* ===== ZOOM-IN INSET ============================================== */}
        {/* Dashed leader: execute_tools.right → zoom panel left edge. */}
        <line
          x1={zoomLeaderStart.x}
          y1={zoomLeaderStart.y}
          x2={zoomLeaderEnd.x}
          y2={zoomLeaderEnd.y}
          stroke={COLORS.INK}
          strokeWidth={1.5}
          strokeDasharray="6 5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Small dot at the execute_tools anchor to signal the "zoom origin". */}
        <circle
          cx={zoomLeaderStart.x}
          cy={zoomLeaderStart.y}
          r={4}
          fill={COLORS.INK}
        />

        {(() => {
          // Panel chrome
          const panelX = ZOOM_X;
          const panelY = ZOOM_Y;
          const panelW = ZOOM_W;
          const panelH = ZOOM_H;
          const headerH = 44;
          // Header layout: magnifier icon → 12px gap → label, all on one row.
          const headerPadX = 14;
          const magR = 8; // magnifier glass radius
          const magCx = panelX + headerPadX + magR;
          const magCy = panelY + headerH / 2;
          const labelX = magCx + magR + 12; // 12px gap after the glass
          // Chip layout inside the panel body.
          const chipPadX = 14;
          const chipTopY = panelY + headerH + 12;
          const chipH = 34;
          const chipGap = 8;
          // Icon slot geometry inside each chip.
          const iconBox = 22; // 22×22 viewBox for each lucide icon
          return (
            <g>
              {/* Panel shell */}
              <rect
                x={panelX}
                y={panelY}
                width={panelW}
                height={panelH}
                rx={14}
                ry={14}
                fill={COLORS.PAPER}
                stroke={COLORS.INK}
                strokeWidth={2}
                filter={`url(#${SHADOW_ID})`}
              />
              {/* Header strip */}
              <rect
                x={panelX}
                y={panelY}
                width={panelW}
                height={headerH}
                rx={14}
                ry={14}
                fill={COLORS.INK}
              />
              {/* Mask the bottom of the header rounding */}
              <rect
                x={panelX}
                y={panelY + headerH - 14}
                width={panelW}
                height={14}
                fill={COLORS.INK}
              />
              {/* Magnifier icon (search glass) — sits left, label sits right */}
              <g
                stroke="#FFFFFF"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              >
                <circle cx={magCx} cy={magCy} r={magR} />
                <line
                  x1={magCx + magR * 0.72}
                  y1={magCy + magR * 0.72}
                  x2={magCx + magR * 0.72 + 5}
                  y2={magCy + magR * 0.72 + 5}
                />
              </g>
              <text
                x={labelX}
                y={panelY + headerH / 2 + 5}
                fontFamily={FONTS.SANS}
                fontSize={14}
                fontWeight={700}
                fill="#FFFFFF"
                style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
              >
                Allow-listed tools
              </text>

              {/* Tool chips */}
              {ZOOM_TOOLS.map((tool, i) => {
                const y = chipTopY + i * (chipH + chipGap);
                const iconX = panelX + chipPadX + 8;
                const iconY = y + (chipH - iconBox) / 2;
                return (
                  <g key={tool.name}>
                    <rect
                      x={panelX + chipPadX}
                      y={y}
                      width={panelW - chipPadX * 2}
                      height={chipH}
                      rx={7}
                      ry={7}
                      fill={COLORS.SURFACE}
                      stroke={COLORS.HAIRLINE_STRONG}
                      strokeWidth={1.25}
                    />
                    {/* Leading lucide icon — 22×22, stroke-based, ink-muted */}
                    <g transform={`translate(${iconX}, ${iconY})`}>
                      <g
                        transform={`scale(${iconBox / 24})`}
                        fill="none"
                        stroke={COLORS.INK}
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {LUCIDE_ICONS[tool.icon]}
                      </g>
                    </g>
                    <text
                      x={iconX + iconBox + 8}
                      y={y + chipH / 2 + 5}
                      fontFamily={FONTS.MONO}
                      fontSize={15}
                      fontWeight={600}
                      fill={COLORS.INK}
                      style={{ letterSpacing: "0" }}
                    >
                      {tool.name}
                    </text>
                  </g>
                );
              })}

              {/* "more tools follow" slot — occupies the same vertical rhythm
               *  as a 7th chip but renders a borderless Lucide `more-horizontal`
               *  icon (three filled dots) centered in the slot. Muted ink so
               *  it reads as "…and there are more" without masquerading as a
               *  tool chip. */}
              {(() => {
                const i = ZOOM_TOOLS.length;
                const y = chipTopY + i * (chipH + chipGap);
                const cx = panelX + panelW / 2;
                const cy = y + chipH / 2;
                const dotR = 2.4;
                const dotGap = 9;
                return (
                  <g fill={COLORS.INK} stroke="none">
                    <circle cx={cx - dotGap} cy={cy} r={dotR} />
                    <circle cx={cx} cy={cy} r={dotR} />
                    <circle cx={cx + dotGap} cy={cy} r={dotR} />
                  </g>
                );
              })()}
            </g>
          );
        })()}

        {/* ===== LEGEND ===================================================== */}
        {(() => {
          const chips: Array<{ tier: Tier; label: string }> = [
            { tier: "deterministic",  label: "deterministic" },
            { tier: "llm_delegated",  label: "llm-delegated" },
            { tier: "action",         label: "action" },
            { tier: "human_in_loop",  label: "human-in-loop" },
          ];
          const swatchW = 32;
          const swatchH = 20;
          const gapBetween = 56;
          const gapInside = 14;
          // Approx text width — fontSize 18 medium ~ 10px/char.
          const charW = 10;
          const widths = chips.map(
            (c) => swatchW + gapInside + c.label.length * charW,
          );
          const totalW =
            widths.reduce((a, b) => a + b, 0) + gapBetween * (chips.length - 1);
          let cursor = (DW - totalW) / 2;
          const baseY = 838;
          return (
            <g>
              {chips.map((c, i) => {
                const st = tierStyle(c.tier);
                const x = cursor;
                const y = baseY;
                const swatchY = y - swatchH + 4;
                const node = (
                  <g key={c.tier}>
                    <rect
                      x={x}
                      y={swatchY}
                      width={swatchW}
                      height={swatchH}
                      rx={5}
                      fill={st.fill}
                      stroke={st.stroke}
                      strokeWidth={st.strokeWidth}
                      strokeDasharray={st.strokeDasharray}
                    />
                    <text
                      x={x + swatchW + gapInside}
                      y={y}
                      fontFamily={FONTS.SANS}
                      fontSize={18}
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
        })()}
      </g>
    </svg>
  );
};
