import React from "react";
import { COLORS, FONTS } from "../theme";
import { INSIDE } from "../content";
import { shadowIdFor } from "./primitives";

/**
 * Sandbox & Jupyter Kernel Gateway architecture — page 19.
 *
 * An isometric-style cross-section: UI shell at the top routes requests
 * through the Kernel Gateway into a Docker-contained Python kernel. The
 * sandbox boundary is explicit (Miami-red dashed rect with a "SANDBOX"
 * eyebrow that cuts through the top edge), and hard resource limits are
 * drawn as blueprint dimension callouts — ticked leader lines from each
 * layer to a label on the LEFT margin, so no text clips off the right
 * edge of the page.
 */

// Widened viewBox: the previous 600×420 canvas forced right-anchored labels
// off the page. 820 gives us room for dimension callouts on both margins,
// with the main cross-section centered between them.
const DW = 820;
const DH = 460;
const CONTENT_LEFT = 180; // layer rects start here, leaving callout margin
const CONTENT_RIGHT = DW - 40;
const CONTENT_W = CONTENT_RIGHT - CONTENT_LEFT;

const SHADOW = shadowIdFor("sandbox");

type LayerSpec = {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  label: string;
  sub: string;
  textColor?: string;
};

export const SandboxArchitecture: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {
  const sx = width / DW;
  const sy = height / DH;
  const s = Math.min(sx, sy);
  const offX = (width - DW * s) / 2;
  const offY = (height - DH * s) / 2;

  // Layer rectangles. Sandbox boundary encloses Docker + Python kernel.
  const UI_Y = 58;
  const BACKEND_Y = 148;
  const BOUNDARY_Y = 232;
  const DOCKER_Y = 260;
  const KERNEL_Y = 352;
  const LAYER_H = 66;
  const KERNEL_H = 52;

  const layers: LayerSpec[] = [
    {
      x: CONTENT_LEFT, y: UI_Y, w: CONTENT_W, h: LAYER_H,
      fill: COLORS.PAPER_ELEVATED,
      stroke: COLORS.HAIRLINE_STRONG,
      label: "UI · Frontend",
      sub: "React · Zustand · typed fetch",
    },
    {
      x: CONTENT_LEFT, y: BACKEND_Y, w: CONTENT_W, h: LAYER_H,
      fill: "#FFFFFF",
      stroke: COLORS.INK,
      label: "Backend → Jupyter Kernel Gateway",
      sub: "Express 5 · REST /execute",
    },
    {
      x: CONTENT_LEFT + 16, y: DOCKER_Y, w: CONTENT_W - 32, h: LAYER_H,
      fill: COLORS.INK,
      stroke: COLORS.INK,
      label: "Docker container",
      sub: "non-root · read-only fs · 2GB · 1 CPU",
      textColor: COLORS.PAPER,
    },
    {
      x: CONTENT_LEFT + 48, y: KERNEL_Y, w: CONTENT_W - 96, h: KERNEL_H,
      fill: "#FFFFFF",
      stroke: COLORS.INK,
      label: "Python 3.12 kernel",
      sub: "pandas · sklearn · xgboost",
    },
  ];

  // Resource-limit callouts, laid out on the LEFT margin as blueprint
  // dimension lines. Each callout ties a specific limit to a specific
  // layer; the leader line runs from the layer's left edge to the label
  // block, ending in a 6-px perpendicular tick.
  const LIMIT_CALLOUTS: Array<{ y: number; label: string; value: string }> = [
    { y: UI_Y + LAYER_H / 2,       label: "MEMORY",     value: "2 GB"             },
    { y: BACKEND_Y + LAYER_H / 2,  label: "CPU",        value: "1 CORE"           },
    { y: DOCKER_Y + 18,            label: "USER",       value: "NON-ROOT"         },
    { y: DOCKER_Y + LAYER_H - 16,  label: "ROOT FS",    value: "READ-ONLY"        },
    { y: KERNEL_Y + 12,            label: "NETWORK",    value: "EGRESS ALLOW-LIST" },
    { y: KERNEL_Y + KERNEL_H - 8,  label: "COLD-START", value: "< 1 s"            },
  ];

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
        <pattern id="sbx-hatch" patternUnits="userSpaceOnUse" width="8" height="8">
          <path d="M 0 8 L 8 0" stroke={COLORS.MIAMI_RED} strokeWidth="0.5" opacity="0.2" />
        </pattern>
        <marker
          id="sbx-pipe-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill={COLORS.INK} />
        </marker>
      </defs>

      <g transform={`translate(${offX}, ${offY}) scale(${s})`}>
        {/* Title ribbon */}
        <text
          x={DW / 2}
          y={30}
          textAnchor="middle"
          fontFamily={FONTS.MONO}
          fontSize={14}
          fontWeight={600}
          fill={COLORS.INK_MUTED}
          style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}
        >
          host · user space · docker container · jupyter kernel
        </text>

        {/* Sandbox boundary — must render UNDER the layers so they read as
            "inside" the sandbox. Dashed Miami-red outline at 1.5pt, hatched
            fill at low opacity, with a SANDBOX eyebrow that cuts through
            the top edge (paper-colored rect behind the text). */}
        <g>
          <rect
            x={CONTENT_LEFT - 12}
            y={BOUNDARY_Y}
            width={CONTENT_W + 24}
            height={DH - BOUNDARY_Y - 32}
            rx={14}
            fill="url(#sbx-hatch)"
            stroke={COLORS.MIAMI_RED}
            strokeWidth={1.5}
            strokeDasharray="6 5"
          />
          {/* Paper panel behind the eyebrow so the dashed line "cuts" cleanly */}
          <rect
            x={DW / 2 - 56}
            y={BOUNDARY_Y - 10}
            width={112}
            height={20}
            fill={COLORS.PAPER}
          />
          <text
            x={DW / 2}
            y={BOUNDARY_Y + 4}
            textAnchor="middle"
            fontFamily={FONTS.MONO}
            fontSize={11}
            fontWeight={700}
            fill={COLORS.MIAMI_RED}
            style={{ letterSpacing: "0.24em", textTransform: "uppercase" }}
          >
            Sandbox
          </text>
        </g>

        {/* Layers */}
        {layers.map((l) => (
          <Layer key={l.label} {...l} shadowId={SHADOW} />
        ))}

        {/* Pipes (data flow, top→bottom) */}
        <Pipe x={DW / 2} y1={UI_Y + LAYER_H} y2={BACKEND_Y} />
        <Pipe x={DW / 2} y1={BACKEND_Y + LAYER_H} y2={DOCKER_Y} thick />
        <Pipe x={DW / 2} y1={DOCKER_Y + LAYER_H} y2={KERNEL_Y} />

        {/* Blueprint dimension callouts on the left margin */}
        {LIMIT_CALLOUTS.map((lim) => (
          <DimensionCallout
            key={lim.label}
            y={lim.y}
            targetX={CONTENT_LEFT}
            labelX={24}
            label={lim.label}
            value={lim.value}
          />
        ))}

        {/* Approval-gate callout pinned to the top-right of the sandbox
            boundary — echoes INSIDE.sandbox.approvalGate so the metaphor
            that "every cell is yours to read, edit, or reject" is anchored
            visually to the sandbox container. */}
        <ApprovalGateInline
          x={CONTENT_RIGHT - 260}
          y={BOUNDARY_Y - 66}
          width={260}
          text={INSIDE.sandbox.approvalGate}
          anchorX={CONTENT_RIGHT - 10}
          anchorY={BOUNDARY_Y}
        />
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Layer rectangle with label + sublabel, 14-px corner radius, 1.75-px stroke.
// ---------------------------------------------------------------------------

const Layer: React.FC<LayerSpec & { shadowId: string }> = ({
  x, y, w, h, fill, stroke, label, sub, textColor = COLORS.INK, shadowId,
}) => (
  <g filter={`url(#${shadowId})`}>
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={12}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.75}
    />
    <text
      x={x + 18}
      y={y + h / 2 - 2}
      fontFamily={FONTS.SANS}
      fontSize={16}
      fontWeight={700}
      fill={textColor}
      style={{ letterSpacing: "-0.005em" }}
    >
      {label}
    </text>
    <text
      x={x + 18}
      y={y + h / 2 + 18}
      fontFamily={FONTS.MONO}
      fontSize={11}
      fontWeight={500}
      fill={textColor === COLORS.PAPER ? "rgba(255,255,255,0.78)" : COLORS.INK_MUTED}
      style={{ letterSpacing: "0.04em" }}
    >
      {sub}
    </text>
  </g>
);

// ---------------------------------------------------------------------------
// Pipe — a short rounded rect that represents a data-flow channel between
// two stacked layers. When `thick` is set, it also renders an arrowhead so
// the reader sees the crossing of the sandbox boundary as directional.
// ---------------------------------------------------------------------------

const Pipe: React.FC<{ x: number; y1: number; y2: number; thick?: boolean }> = ({
  x, y1, y2, thick = false,
}) => {
  const w = thick ? 8 : 4;
  const color = thick ? COLORS.INK : COLORS.HAIRLINE_STRONG;
  const opacity = thick ? 1 : 0.65;
  return (
    <g>
      <line
        x1={x}
        y1={y1}
        x2={x}
        y2={y2 - 4}
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        opacity={opacity}
        markerEnd={thick ? "url(#sbx-pipe-arrow)" : undefined}
      />
    </g>
  );
};

// ---------------------------------------------------------------------------
// Dimension callout — blueprint-style line from a layer's left edge to a
// label block on the left margin. Hairline stroke, perpendicular terminator
// ticks at both endpoints, and a two-line label (eyebrow + value) so each
// limit reads as a dimensional annotation rather than prose.
// ---------------------------------------------------------------------------

const DimensionCallout: React.FC<{
  y: number;
  targetX: number;
  labelX: number;
  label: string;
  value: string;
}> = ({ y, targetX, labelX, label, value }) => {
  const accent = COLORS.ACCENT;
  const tickLen = 5;
  return (
    <g>
      {/* leader line */}
      <line
        x1={labelX + 110}
        y1={y}
        x2={targetX - 2}
        y2={y}
        stroke={accent}
        strokeWidth={0.5}
      />
      {/* terminator ticks — perpendicular to the leader */}
      <line x1={labelX + 110} y1={y - tickLen} x2={labelX + 110} y2={y + tickLen} stroke={accent} strokeWidth={0.75} />
      <line x1={targetX - 2} y1={y - tickLen} x2={targetX - 2} y2={y + tickLen} stroke={accent} strokeWidth={0.75} />
      {/* label block */}
      <text
        x={labelX}
        y={y - 4}
        fontFamily={FONTS.MONO}
        fontSize={9}
        fontWeight={700}
        fill={accent}
        style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}
      >
        {label}
      </text>
      <text
        x={labelX}
        y={y + 10}
        fontFamily={FONTS.MONO}
        fontSize={11}
        fontWeight={700}
        fill={COLORS.INK}
        style={{ letterSpacing: "0.01em" }}
      >
        {value}
      </text>
    </g>
  );
};

// ---------------------------------------------------------------------------
// Inline approval-gate callout — a small dotted panel that echoes the
// booklet's ApprovalGateCallout HTML component but lives inside the SVG so
// it can be tethered to the sandbox boundary with an L-shaped leader.
// ---------------------------------------------------------------------------

const ApprovalGateInline: React.FC<{
  x: number;
  y: number;
  width: number;
  text: string;
  anchorX: number;
  anchorY: number;
}> = ({ x, y, width, text, anchorX, anchorY }) => {
  const h = 54;
  // Wrap the text roughly by words to fit the width (rough 18 chars per line
  // at the current serif size + width). We only need 2 lines max.
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > 30) {
      lines.push(current.trim());
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  }
  if (current) lines.push(current);
  const shown = lines.slice(0, 2);

  // L-shaped leader: callout bottom → horizontal → down to anchor corner.
  const fromX = x + width / 2;
  const fromY = y + h;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={h}
        rx={4}
        fill={COLORS.PAPER}
        stroke={COLORS.INK}
        strokeWidth={0.75}
        strokeDasharray="2 2"
      />
      <text
        x={x + 12}
        y={y + 18}
        fontFamily={FONTS.MONO}
        fontSize={9}
        fontWeight={700}
        fill={COLORS.INK}
        style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}
      >
        Pending approval
      </text>
      {shown.map((line, i) => (
        <text
          key={i}
          x={x + 12}
          y={y + 32 + i * 12}
          fontFamily={FONTS.SERIF}
          fontStyle="italic"
          fontSize={11}
          fontWeight={400}
          fill={COLORS.INK}
          style={{ letterSpacing: "0" }}
        >
          {line}
        </text>
      ))}
      {/* L leader */}
      <line x1={fromX} y1={fromY} x2={fromX} y2={anchorY - 8} stroke={COLORS.INK} strokeWidth={0.5} strokeDasharray="2 2" />
      <line x1={fromX} y1={anchorY - 8} x2={anchorX - 4} y2={anchorY - 8} stroke={COLORS.INK} strokeWidth={0.5} strokeDasharray="2 2" />
      <circle cx={anchorX - 4} cy={anchorY - 8} r={2} fill={COLORS.INK} />
    </g>
  );
};
