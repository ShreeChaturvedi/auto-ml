import React from "react";
import { COLORS, FONTS } from "../theme";
import { INSIDE } from "../content";
import { shadowIdFor } from "./primitives";

/**
 * MCP tool registry — page 18. Central MCP hub with 20 tools arrayed around
 * it on two concentric rings, clustered into 6 category sectors.
 *
 * Layout conventions:
 *   • The 5 "most-used" tools sit on the inner ring and each carries a
 *     highlighter halo + italic serif margin caption.
 *   • The remaining 15 tools orbit on the outer ring, staggered by one of
 *     two radii per sector so their chips never overlap.
 *   • Tools cluster clockwise from 12 o'clock: inspect (top), transform
 *     (top-right), execute (bottom-right), search (bottom), validate
 *     (bottom-left), plan (top-left).
 *
 * Labels use full words ("TRANSFORM", "VALIDATE") and the chip widths are
 * sized from the label string so long names like `run_notebook_cell` fit
 * without truncation.
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

// Clockwise sector centers (radians, 0 = right). Each category owns a 60°
// slice; tools within the slice are spread across it evenly.
const SECTOR: Record<Category, number> = {
  inspect:   -Math.PI / 2,                     // 12 o'clock
  transform: -Math.PI / 2 + Math.PI / 3,       //  2 o'clock
  execute:   -Math.PI / 2 + (2 * Math.PI) / 3, //  4 o'clock
  search:     Math.PI / 2,                     //  6 o'clock
  validate:  -Math.PI / 2 + (4 * Math.PI) / 3, //  8 o'clock
  plan:      -Math.PI / 2 + (5 * Math.PI) / 3, // 10 o'clock
};

const HIGHLIGHT_TOOLS: Record<string, string> = {
  get_dataset_profile: "samples 20 rows on upload",
  edit_cell:           "patches notebook in place",
  run_notebook_cell:   "executes in container, streams output",
  propose_plan:        "drafts 3-step plan from prompt",
  request_approval:    "blocks until user commits",
};

// Order categories appear in the bottom legend (reading order).
const LEGEND_ORDER: Array<{ key: Category; label: string }> = [
  { key: "inspect",   label: "INSPECT"   },
  { key: "transform", label: "TRANSFORM" },
  { key: "execute",   label: "EXECUTE"   },
  { key: "search",    label: "SEARCH"    },
  { key: "validate",  label: "VALIDATE"  },
  { key: "plan",      label: "PLAN"      },
];

const SHADOW = shadowIdFor("mcp");

export const MCPToolRegistry: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {
  const cx = width / 2;
  const cy = height / 2 - 14; // leave room for the legend strip at the bottom
  const minDim = Math.min(width, height);
  const innerR = minDim * 0.26;
  const outerR = minDim * 0.40;
  const outerRAlt = minDim * 0.46; // staggered ring for overlap avoidance

  const tools = INSIDE.mcpRegistry.tools;
  const inner = tools.filter((t) => t.name in HIGHLIGHT_TOOLS);
  const outer = tools.filter((t) => !(t.name in HIGHLIGHT_TOOLS));

  // Group outer tools by category, then place them within each sector.
  const outerByCategory = outer.reduce<Record<Category, typeof outer>>(
    (acc, t) => {
      const c = t.category as Category;
      acc[c] = acc[c] ?? [];
      acc[c].push(t);
      return acc;
    },
    { inspect: [], transform: [], validate: [], execute: [], plan: [], search: [] },
  );

  // Build positioned outer chips. For each sector, spread tools ±25° around
  // the sector center and alternate radii to avoid row collisions.
  const outerPlaced = (Object.keys(outerByCategory) as Category[]).flatMap((cat) => {
    const list = outerByCategory[cat];
    const center = SECTOR[cat];
    const spread = (25 * Math.PI) / 180;
    return list.map((t, i) => {
      const fraction = list.length === 1 ? 0 : i / (list.length - 1) - 0.5;
      const angle = center + fraction * spread;
      const r = i % 2 === 0 ? outerR : outerRAlt;
      return {
        ...t,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        angle,
      };
    });
  });

  const innerPlaced = inner.map((t) => {
    const angle = SECTOR[t.category as Category];
    return {
      ...t,
      x: cx + Math.cos(angle) * innerR,
      y: cy + Math.sin(angle) * innerR,
      angle,
    };
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
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

      {/* Concentric scaffold rings */}
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={COLORS.HAIRLINE} strokeWidth={0.75} strokeDasharray="2 4" opacity={0.5} />
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={COLORS.HAIRLINE} strokeWidth={0.75} strokeDasharray="2 4" opacity={0.4} />
      <circle cx={cx} cy={cy} r={outerRAlt} fill="none" stroke={COLORS.HAIRLINE} strokeWidth={0.5} strokeDasharray="2 4" opacity={0.3} />

      {/* Faint radial spokes marking sector centers */}
      {(Object.keys(SECTOR) as Category[]).map((cat) => {
        const a = SECTOR[cat];
        const x1 = cx + Math.cos(a) * innerR;
        const y1 = cy + Math.sin(a) * innerR;
        const x2 = cx + Math.cos(a) * outerRAlt;
        const y2 = cy + Math.sin(a) * outerRAlt;
        return (
          <line
            key={`spoke-${cat}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={CATEGORY_COLOR[cat]}
            strokeWidth={0.75}
            opacity={0.2}
          />
        );
      })}

      {/* Hub → inner chip spokes */}
      {innerPlaced.map((t) => (
        <line
          key={`link-${t.name}`}
          x1={cx}
          y1={cy}
          x2={t.x}
          y2={t.y}
          stroke={CATEGORY_COLOR[t.category as Category]}
          strokeWidth={1.5}
          opacity={0.6}
        />
      ))}

      {/* Outer chips */}
      {outerPlaced.map((t) => (
        <ChipSmall
          key={t.name}
          x={t.x}
          y={t.y}
          label={t.name}
          color={CATEGORY_COLOR[t.category as Category]}
        />
      ))}

      {/* Inner chips with highlighter rings + serif margin captions */}
      {innerPlaced.map((t) => {
        const cap = HIGHLIGHT_TOOLS[t.name] ?? "";
        const unitX = Math.cos(t.angle);
        const unitY = Math.sin(t.angle);
        const captionDist = 78;
        const captionX = t.x + unitX * captionDist;
        const captionY = t.y + unitY * captionDist;
        const anchor: "start" | "middle" | "end" =
          unitX > 0.3 ? "start" : unitX < -0.3 ? "end" : "middle";
        return (
          <g key={`inner-${t.name}`}>
            {/* Highlighter halo — subtle, readable */}
            <circle
              cx={t.x}
              cy={t.y}
              r={30}
              fill="none"
              stroke={CATEGORY_COLOR[t.category as Category]}
              strokeWidth={1.25}
              opacity={0.35}
              strokeDasharray="2 3"
            />
            <ChipLarge
              x={t.x}
              y={t.y}
              label={t.name}
              color={CATEGORY_COLOR[t.category as Category]}
            />
            {/* italic serif caption */}
            <text
              x={captionX}
              y={captionY}
              textAnchor={anchor}
              fontFamily={FONTS.SERIF}
              fontStyle="italic"
              fontSize={13}
              fontWeight={400}
              fill={COLORS.INK_MUTED}
              style={{ letterSpacing: "0.005em" }}
            >
              {cap}
            </text>
          </g>
        );
      })}

      {/* Hub */}
      <g filter={`url(#${SHADOW})`}>
        <circle cx={cx} cy={cy} r={52} fill={COLORS.INK} />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontFamily={FONTS.SANS}
          fontSize={18}
          fontWeight={700}
          fill={COLORS.PAPER}
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          MCP
        </text>
        <text
          x={cx}
          y={cy + 14}
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
      <Legend width={width} y={height - 14} />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Chip primitives — width is derived from the label length so no string
// can truncate. Height + typography bumped to match the poster's chip scale.
// ---------------------------------------------------------------------------

const ChipLarge: React.FC<{
  x: number;
  y: number;
  label: string;
  color: string;
}> = ({ x, y, label, color }) => {
  const w = Math.max(110, label.length * 8 + 28);
  const h = 28;
  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`} filter={`url(#${shadowIdFor("mcp")})`}>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={14}
        fill={COLORS.PAPER}
        stroke={color}
        strokeWidth={1.75}
      />
      <circle cx={14} cy={h / 2} r={5} fill={color} />
      <text
        x={26}
        y={h / 2 + 4.5}
        fontFamily={FONTS.MONO}
        fontSize={12}
        fontWeight={700}
        fill={COLORS.INK}
        style={{ letterSpacing: "0.02em" }}
      >
        {label}
      </text>
    </g>
  );
};

const ChipSmall: React.FC<{
  x: number;
  y: number;
  label: string;
  color: string;
}> = ({ x, y, label, color }) => {
  const w = Math.max(92, label.length * 7 + 16);
  const h = 22;
  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={11}
        fill={COLORS.PAPER_ELEVATED}
        stroke={color}
        strokeWidth={1.25}
      />
      <text
        x={w / 2}
        y={h / 2 + 4}
        textAnchor="middle"
        fontFamily={FONTS.MONO}
        fontSize={11}
        fontWeight={600}
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
  const pad = 18;
  const inner = width - pad * 2;
  const step = inner / LEGEND_ORDER.length;
  return (
    <g>
      {LEGEND_ORDER.map((item, i) => {
        const x = pad + step * i + step / 2;
        return (
          <g key={item.key} transform={`translate(${x}, ${y})`}>
            <circle cx={-40} cy={0} r={5} fill={CATEGORY_COLOR[item.key]} />
            <text
              x={-28}
              y={4}
              fontFamily={FONTS.MONO}
              fontSize={11}
              fontWeight={700}
              fill={COLORS.INK}
              style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
};
