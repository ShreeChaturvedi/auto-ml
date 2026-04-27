import React from "react";
import { COLORS, FONTS } from "../theme";
import { INSIDE } from "../content";
import { shadowIdFor } from "./primitives";

/**
 * MCP tool registry — page 18. Central MCP hub with 20 tools laid out in
 * four quadrant CLUSTERS around it (not in radial arcs, which collide for
 * long tool names). Each cluster is a vertical list of chips connected to
 * the hub by a colored spoke.
 *
 *   Cluster layout on a 5.6"×7" canvas:
 *     TL  inspect  (4 tools)        TR  transform (6 tools)
 *     BL  validate (4 tools)        BR  execute   (2 tools)
 *                                       + search  (2 tools)
 *   Plan (2 tools) flanks the hub horizontally: propose_plan on the left
 *   of the hub, request_approval on the right.
 *
 * The 5 most-used tools (`get_dataset_profile`, `edit_cell`,
 * `run_notebook_cell`, `propose_plan`, `request_approval`) get a
 * highlighter halo + italic serif margin caption.
 */

type Category = "inspect" | "transform" | "validate" | "execute" | "plan" | "search";

const CATEGORY_COLOR: Record<Category, string> = {
  inspect:   COLORS.ACCENT,
  transform: COLORS.MIAMI_RED,
  validate:  COLORS.SUCCESS,
  execute:   COLORS.INK,
  plan:      COLORS.AMBER,
  search:    COLORS.NEUTRAL_600,
};

const HIGHLIGHT_TOOLS: Record<string, string> = {
  get_dataset_profile: "samples 20 rows",
  edit_cell:           "patches in place",
  run_notebook_cell:   "streams output",
  propose_plan:        "drafts 3-step plan",
  request_approval:    "blocks until user commits",
};

// Legend reading order = the order labels read around the page.
const LEGEND_ORDER: Array<{ key: Category; label: string }> = [
  { key: "plan",      label: "PLAN"      },
  { key: "inspect",   label: "INSPECT"   },
  { key: "transform", label: "TRANSFORM" },
  { key: "execute",   label: "EXECUTE"   },
  { key: "validate",  label: "VALIDATE"  },
  { key: "search",    label: "SEARCH"    },
];

const SHADOW = shadowIdFor("mcp");

// Design-space canvas; draws the diagram inside a 700×620 box then scales to
// fit the consumer's width×height. This keeps tool chips + hub + captions
// in a stable coordinate system regardless of render size.
const DW = 700;
const DH = 620;

// Each cluster is anchored at a corner of the canvas. The chips stack
// vertically from the anchor toward the hub so longer names still fit.
type Cluster = {
  anchorX: number;
  anchorY: number;
  direction: "tl" | "tr" | "bl" | "br"; // which corner this cluster lives in
};

// Clusters pushed in from the canvas edge so captions for the outermost
// highlighted chip (get_dataset_profile, edit_cell, run_notebook_cell) have
// room to land above the chip (between chip and the cluster eyebrow label)
// without colliding with the next chip below.
const CLUSTERS: Record<Exclude<Category, "plan" | "search">, Cluster> = {
  inspect:   { anchorX: 100, anchorY: 160, direction: "tl" },
  transform: { anchorX: DW - 100, anchorY: 160, direction: "tr" },
  validate:  { anchorX: 100, anchorY: DH - 140, direction: "bl" },
  execute:   { anchorX: DW - 100, anchorY: DH - 160, direction: "br" },
};

const HUB_X = DW / 2;
const HUB_Y = DH / 2 - 16;
const HUB_R = 46;

// Row pitch for the vertical chip stacks inside each cluster.
const ROW_PITCH = 32;

export const MCPToolRegistry: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {
  const sx = width / DW;
  const sy = height / DH;
  const s = Math.min(sx, sy);
  const offX = (width - DW * s) / 2;
  const offY = (height - DH * s) / 2;

  type Tool = { name: string; category: string };
  const tools: Tool[] = INSIDE.mcpRegistry.tools as unknown as Tool[];
  const isHighlighted = (name: string) => name in HIGHLIGHT_TOOLS;

  // Partition tools by category for cluster layout.
  const byCategory = tools.reduce<Record<Category, Tool[]>>(
    (acc, t) => {
      const c = t.category as Category;
      (acc[c] ??= []).push(t);
      return acc;
    },
    { inspect: [], transform: [], validate: [], execute: [], plan: [], search: [] },
  );

  // Build cluster-placed tools for the 4 quadrant clusters.
  type Placed = Tool & { x: number; y: number; highlighted: boolean };
  const clusterPlaced: Placed[] = [];
  (Object.keys(CLUSTERS) as Array<keyof typeof CLUSTERS>).forEach((cat) => {
    const c = CLUSTERS[cat];
    const list = byCategory[cat];
    list.forEach((t, i) => {
      // Stack vertically from the anchor; TL/TR clusters stack downward,
      // BL/BR clusters stack upward so the cluster grows away from the hub.
      const verticalDir = c.direction.startsWith("t") ? 1 : -1;
      const y = c.anchorY + verticalDir * i * ROW_PITCH;
      clusterPlaced.push({ ...t, x: c.anchorX, y, highlighted: isHighlighted(t.name) });
    });
  });

  // Plan tools flank the hub horizontally: propose_plan on the left edge of
  // the hub, request_approval on the right. Both at the hub's vertical
  // centerline.
  const planPlaced: Placed[] = byCategory.plan.map((t) => {
    const x = t.name === "propose_plan" ? HUB_X - 130 : HUB_X + 130;
    return { ...t, x, y: HUB_Y - 70, highlighted: isHighlighted(t.name) };
  });

  // Search tools sit directly below the hub on the bottom axis.
  const searchPlaced: Placed[] = byCategory.search.map((t, i) => {
    const x = HUB_X - 74 + i * 148;
    return { ...t, x, y: HUB_Y + 126, highlighted: isHighlighted(t.name) };
  });

  const all = [...clusterPlaced, ...planPlaced, ...searchPlaced];

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
      style={{ display: "block" }}
    >
      <defs>
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

      <g transform={`translate(${offX}, ${offY}) scale(${s})`}>
        {/* Cluster quadrant labels — no dashed backdrop rect (previously
            clipped the plan chips flanking the hub). Each label sits at the
            canvas corner the cluster occupies; the spokes + chip colors do
            the clustering work. Pushed well outside the chip stack to leave
            room for the italic margin caption on the outermost highlighted
            chip in each cluster. */}
        {(Object.keys(CLUSTERS) as Array<keyof typeof CLUSTERS>).map((cat) => {
          const c = CLUSTERS[cat];
          const labelY = c.direction.startsWith("t")
            ? c.anchorY - 60
            : c.anchorY + 50;
          return (
            <text
              key={`label-${cat}`}
              x={c.anchorX}
              y={labelY}
              textAnchor="middle"
              fontFamily={FONTS.MONO}
              fontSize={11}
              fontWeight={700}
              fill={CATEGORY_COLOR[cat]}
              style={{ letterSpacing: "0.2em", textTransform: "uppercase" }}
            >
              {cat}
            </text>
          );
        })}

        {/* Hub → tool spokes. Each spoke runs from the hub perimeter to the
            chip center, colored by the tool's category. */}
        {all.map((t) => {
          const dx = t.x - HUB_X;
          const dy = t.y - HUB_Y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / d;
          const uy = dy / d;
          const x1 = HUB_X + ux * HUB_R;
          const y1 = HUB_Y + uy * HUB_R;
          return (
            <line
              key={`spoke-${t.name}`}
              x1={x1}
              y1={y1}
              x2={t.x}
              y2={t.y}
              stroke={CATEGORY_COLOR[t.category as Category]}
              strokeWidth={t.highlighted ? 1.5 : 0.75}
              opacity={t.highlighted ? 0.6 : 0.35}
            />
          );
        })}

        {/* Chips — halo sizes track the chip width so long-label chips get
            a proportionally wider highlighter. */}
        {all.map((t) => {
          // Keep width formula in sync with Chip component.
          const chipW = Math.max(100, t.name.length * 6.8 + 22);
          const haloW = chipW + 16;
          const haloH = 34;
          return (
            <g key={`chip-${t.name}`}>
              {t.highlighted && (
                <rect
                  x={t.x - haloW / 2}
                  y={t.y - haloH / 2}
                  width={haloW}
                  height={haloH}
                  rx={haloH / 2}
                  fill="none"
                  stroke={CATEGORY_COLOR[t.category as Category]}
                  strokeWidth={1.25}
                  opacity={0.4}
                  strokeDasharray="2 3"
                />
              )}
              <Chip
                x={t.x}
                y={t.y}
                label={t.name}
                color={CATEGORY_COLOR[t.category as Category]}
                emphasis={t.highlighted}
              />
            </g>
          );
        })}

        {/* Italic serif margin captions for the 5 highlighted tools. Each
            caption is placed in the gutter between the chip and the hub,
            positioned so it never overlaps its chip or the hub. */}
        {all.filter((t) => t.highlighted).map((t) => {
          const cap = HIGHLIGHT_TOOLS[t.name] ?? "";
          // Caption placement per highlighted tool (hand-tuned for the
          // fixed 5-tool set).
          //  • get_dataset_profile: TL cluster, caption pushed right-of-chip
          //    on the same row; reads into the gutter between TL and the
          //    hub.
          //  • edit_cell: TR cluster, caption pushed left-of-chip on the
          //    same row.
          //  • run_notebook_cell: BR execute cluster; caption above-left of
          //    the chip so it lands above the EXECUTE eyebrow.
          //  • propose_plan/request_approval: flanking the hub at a row of
          //    their own; captions above the chip in the empty space.
          // Captions land ABOVE each highlighted chip in the gap between
          // the cluster eyebrow label and the top of the chip stack. Same
          // for the flanking plan chips. For run_notebook_cell (bottom of
          // the execute stack), the caption goes BELOW the chip toward the
          // EXECUTE eyebrow label.
          const PLACE: Record<string, { dx: number; dy: number; anchor: "start" | "middle" | "end" }> = {
            propose_plan:        { dx: 0, dy: -22, anchor: "middle" },
            request_approval:    { dx: 0, dy: -22, anchor: "middle" },
            get_dataset_profile: { dx: 0, dy: -24, anchor: "middle" },
            edit_cell:           { dx: 0, dy: -24, anchor: "middle" },
            run_notebook_cell:   { dx: 0, dy:  28, anchor: "middle" },
          };
          const p = PLACE[t.name] ?? { dx: 0, dy: -22, anchor: "middle" as const };
          return (
            <text
              key={`cap-${t.name}`}
              x={t.x + p.dx}
              y={t.y + p.dy}
              textAnchor={p.anchor}
              fontFamily={FONTS.SERIF}
              fontStyle="italic"
              fontSize={12}
              fontWeight={400}
              fill={COLORS.INK_MUTED}
              style={{ letterSpacing: "0.005em" }}
            >
              {cap}
            </text>
          );
        })}

        {/* Hub */}
        <g filter={`url(#${SHADOW})`}>
          <circle cx={HUB_X} cy={HUB_Y} r={HUB_R} fill={COLORS.INK} />
          <text
            x={HUB_X}
            y={HUB_Y - 2}
            textAnchor="middle"
            fontFamily={FONTS.SANS}
            fontSize={20}
            fontWeight={700}
            fill={COLORS.PAPER}
            style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            MCP
          </text>
          <text
            x={HUB_X}
            y={HUB_Y + 16}
            textAnchor="middle"
            fontFamily={FONTS.MONO}
            fontSize={10}
            fontWeight={500}
            fill="rgba(255,255,255,0.72)"
            style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}
          >
            registry
          </text>
        </g>

        {/* Legend — category swatches spread across the full width */}
        <Legend width={DW} y={DH - 16} />
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Chip — unified chip primitive with an `emphasis` boolean for highlighted
// tools. Width derived from label length; no truncation possible.
// ---------------------------------------------------------------------------

const Chip: React.FC<{
  x: number;
  y: number;
  label: string;
  color: string;
  emphasis: boolean;
}> = ({ x, y, label, color, emphasis }) => {
  const w = Math.max(100, label.length * 6.8 + 22);
  const h = emphasis ? 24 : 22;
  return (
    <g
      transform={`translate(${x - w / 2}, ${y - h / 2})`}
      filter={emphasis ? `url(#${shadowIdFor("mcp")})` : undefined}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={h / 2}
        fill={emphasis ? COLORS.PAPER : COLORS.PAPER_ELEVATED}
        stroke={color}
        strokeWidth={emphasis ? 1.75 : 1.25}
      />
      {emphasis && <circle cx={11} cy={h / 2} r={3.5} fill={color} />}
      <text
        x={emphasis ? 20 : w / 2}
        y={h / 2 + 3.5}
        textAnchor={emphasis ? "start" : "middle"}
        fontFamily={FONTS.MONO}
        fontSize={emphasis ? 11 : 10}
        fontWeight={emphasis ? 700 : 600}
        fill={COLORS.INK}
        style={{ letterSpacing: "0.02em" }}
      >
        {label}
      </text>
    </g>
  );
};

// ---------------------------------------------------------------------------
// Legend — 6 category swatches spread evenly across the available width so
// every word ("TRANSFORM", "VALIDATE") fits without truncation regardless
// of container size.
// ---------------------------------------------------------------------------

const Legend: React.FC<{ width: number; y: number }> = ({ width, y }) => {
  const charW = 7.0;
  const dotW = 14;
  const gap = 20;
  const items = LEGEND_ORDER.map((item) => ({
    ...item,
    w: dotW + item.label.length * charW,
  }));
  const totalW = items.reduce((a, b) => a + b.w, 0) + gap * (items.length - 1);
  let cursor = (width - totalW) / 2;
  return (
    <g>
      {items.map((item) => {
        const g = (
          <g key={item.key} transform={`translate(${cursor}, ${y})`}>
            <circle cx={4} cy={0} r={4} fill={CATEGORY_COLOR[item.key]} />
            <text
              x={14}
              y={4}
              fontFamily={FONTS.MONO}
              fontSize={10}
              fontWeight={700}
              fill={COLORS.INK}
              style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}
            >
              {item.label}
            </text>
          </g>
        );
        cursor += item.w + gap;
        return g;
      })}
    </g>
  );
};
