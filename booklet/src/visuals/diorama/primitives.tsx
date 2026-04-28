import React from "react";

/**
 * Reusable primitives for the 5 divider dioramas. Every primitive emits
 * a `<g>` so they compose cleanly under a single root `<svg>`. All strokes
 * default to `currentColor` so the scene inherits the line color from its
 * wrapper. Stroke weights grade: 0.5 (construction/grid), 0.9 (outlines),
 * 1.4 (hero silhouettes).
 */

// --- 30deg graphic isometric projection ------------------------------------
// (x, y, z) iso-grid units -> (sx, sy) svg coordinates.
export const iso = (x: number, y: number, z = 0) => ({
  sx: (x - y) * Math.cos(Math.PI / 6), // ~0.866
  sy: (x + y) * Math.sin(Math.PI / 6) - z, // 0.5
});

// --- IsoCube ---------------------------------------------------------------
// 3-polygon prism (top rhombus, left face, right face) + optional silhouette
// edges. Face opacities default to the meta-orchestration treatment.
export type IsoCubeProps = {
  origin: [number, number, number]; // bottom-back corner in iso-grid units
  size: [number, number, number]; // width (x), depth (y), height (z)
  face?: { top: number; left: number; right: number };
  strokeWidth?: number;
  dashed?: boolean;
  dashPattern?: string;
};

export const IsoCube: React.FC<IsoCubeProps> = ({
  origin: [ox, oy, oz],
  size: [w, d, h],
  face = { top: 0.22, left: 0.14, right: 0.08 },
  strokeWidth = 0.9,
  dashed = false,
  dashPattern = "3 3",
}) => {
  // 8 cube corners
  const p000 = iso(ox, oy, oz);
  const p100 = iso(ox + w, oy, oz);
  const p010 = iso(ox, oy + d, oz);
  const p110 = iso(ox + w, oy + d, oz);
  const p001 = iso(ox, oy, oz + h);
  const p101 = iso(ox + w, oy, oz + h);
  const p011 = iso(ox, oy + d, oz + h);
  const p111 = iso(ox + w, oy + d, oz + h);

  const poly = (pts: { sx: number; sy: number }[]) =>
    pts.map((p) => `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`).join(" ");

  const common: React.SVGProps<SVGPolygonElement> = {
    stroke: "currentColor",
    strokeWidth,
    strokeLinejoin: "round",
    ...(dashed ? { strokeDasharray: dashPattern } : {}),
  };

  return (
    <g>
      {/* top rhombus */}
      <polygon
        {...common}
        points={poly([p001, p101, p111, p011])}
        fill="currentColor"
        fillOpacity={face.top}
      />
      {/* left face (x=0 plane rotated) — shown as the left-facing quad */}
      <polygon
        {...common}
        points={poly([p000, p001, p011, p010])}
        fill="currentColor"
        fillOpacity={face.left}
      />
      {/* right face */}
      <polygon
        {...common}
        points={poly([p100, p101, p111, p110])}
        fill="currentColor"
        fillOpacity={face.right}
      />
    </g>
  );
};

// --- IsoPlane --------------------------------------------------------------
// Single rhombus ground tile + optional grid of lines at a lighter opacity.
export type IsoPlaneProps = {
  origin: [number, number, number];
  size: [number, number];
  fillOpacity?: number;
  strokeOpacity?: number;
  strokeWidth?: number;
  grid?: { rows: number; cols: number };
  dashedBorder?: boolean;
};

export const IsoPlane: React.FC<IsoPlaneProps> = ({
  origin: [ox, oy, oz],
  size: [w, d],
  fillOpacity = 0.04,
  strokeOpacity = 0.55,
  strokeWidth = 0.9,
  grid,
  dashedBorder = false,
}) => {
  const p00 = iso(ox, oy, oz);
  const p10 = iso(ox + w, oy, oz);
  const p11 = iso(ox + w, oy + d, oz);
  const p01 = iso(ox, oy + d, oz);

  const points = [p00, p10, p11, p01]
    .map((p) => `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`)
    .join(" ");

  const gridLines: React.ReactElement[] = [];
  if (grid) {
    const { rows, cols } = grid;
    for (let i = 1; i < cols; i++) {
      const t = i / cols;
      const a = iso(ox + w * t, oy, oz);
      const b = iso(ox + w * t, oy + d, oz);
      gridLines.push(
        <line
          key={`c${i}`}
          x1={a.sx}
          y1={a.sy}
          x2={b.sx}
          y2={b.sy}
          stroke="currentColor"
          strokeWidth={0.5}
          strokeOpacity={strokeOpacity * 0.45}
        />,
      );
    }
    for (let j = 1; j < rows; j++) {
      const t = j / rows;
      const a = iso(ox, oy + d * t, oz);
      const b = iso(ox + w, oy + d * t, oz);
      gridLines.push(
        <line
          key={`r${j}`}
          x1={a.sx}
          y1={a.sy}
          x2={b.sx}
          y2={b.sy}
          stroke="currentColor"
          strokeWidth={0.5}
          strokeOpacity={strokeOpacity * 0.45}
        />,
      );
    }
  }

  return (
    <g>
      <polygon
        points={points}
        fill="currentColor"
        fillOpacity={fillOpacity}
        stroke="currentColor"
        strokeOpacity={strokeOpacity}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        {...(dashedBorder ? { strokeDasharray: "2 2" } : {})}
      />
      {gridLines}
    </g>
  );
};

// --- FlowChannel -----------------------------------------------------------
// Arced quadratic bezier connector. Optional frozen tracer segment — no
// animation (printed output). `curvature` is a signed ratio: 0.4 = gentle arc.
export type FlowChannelProps = {
  from: [number, number];
  to: [number, number];
  curvature?: number;
  dashed?: boolean;
  dashPattern?: string;
  strokeWidth?: number;
  tracer?: boolean;
};

export const FlowChannel: React.FC<FlowChannelProps> = ({
  from,
  to,
  curvature = 0.3,
  dashed = false,
  dashPattern = "4 4",
  strokeWidth = 1.0,
  tracer = false,
}) => {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // perpendicular offset to make the arc bulge
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const cx = mx + px * len * curvature;
  const cy = my + py * curvature * len;

  const path = `M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeOpacity={0.85}
        strokeLinecap="round"
        {...(dashed ? { strokeDasharray: dashPattern } : {})}
      />
      {tracer && (
        // Frozen tracer segment — a short, brighter overlay near endpoint
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth + 0.4}
          strokeLinecap="round"
          strokeDasharray={`6 ${Math.hypot(dx, dy).toFixed(0)}`}
          strokeDashoffset={-Math.hypot(dx, dy) * 0.55}
          opacity={0.95}
        />
      )}
    </g>
  );
};

// --- ConstructionLine ------------------------------------------------------
// Dashed measurement leader + optional dot tick + optional text label.
export type ConstructionLineProps = {
  from: [number, number];
  to: [number, number];
  label?: string;
  labelOffset?: [number, number];
  tick?: "start" | "end" | "both" | "none";
  strokeWidth?: number;
  dashPattern?: string;
  fontSize?: number;
  opacity?: number;
};

export const ConstructionLine: React.FC<ConstructionLineProps> = ({
  from,
  to,
  label,
  labelOffset = [6, -2],
  tick = "end",
  strokeWidth = 0.5,
  dashPattern = "5 4",
  fontSize = 5,
  opacity = 0.55,
}) => {
  const [x1, y1] = from;
  const [x2, y2] = to;
  return (
    <g opacity={opacity}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={dashPattern}
      />
      {(tick === "start" || tick === "both") && (
        <circle cx={x1} cy={y1} r={1.2} fill="currentColor" />
      )}
      {(tick === "end" || tick === "both") && (
        <circle cx={x2} cy={y2} r={1.2} fill="currentColor" />
      )}
      {label && (
        <text
          x={x2 + labelOffset[0]}
          y={y2 + labelOffset[1]}
          fontFamily="ui-monospace, monospace"
          fontSize={fontSize}
          letterSpacing="1"
          textAnchor="start"
          fill="currentColor"
        >
          {label}
        </text>
      )}
    </g>
  );
};

// --- Marker ----------------------------------------------------------------
// A small "node dot" — single-purpose punctuation for flow endpoints.
export type MarkerProps = {
  at: [number, number];
  kind: "dot" | "ring" | "halo" | "target";
  size?: number;
};

export const Marker: React.FC<MarkerProps> = ({ at, kind, size = 2 }) => {
  const [x, y] = at;
  if (kind === "dot") {
    return <circle cx={x} cy={y} r={size * 0.8} fill="currentColor" opacity={0.85} />;
  }
  if (kind === "ring") {
    return (
      <g>
        <circle cx={x} cy={y} r={size * 1.4} fill="none" stroke="currentColor" strokeWidth={0.6} opacity={0.55} />
        <circle cx={x} cy={y} r={size * 0.6} fill="currentColor" opacity={0.85} />
      </g>
    );
  }
  if (kind === "halo") {
    return (
      <g>
        <circle cx={x} cy={y} r={size * 3} fill="none" stroke="currentColor" strokeWidth={0.5} opacity={0.22} />
        <circle cx={x} cy={y} r={size * 1.6} fill="none" stroke="currentColor" strokeWidth={0.5} opacity={0.45} />
        <circle cx={x} cy={y} r={size * 0.7} fill="currentColor" opacity={0.9} />
      </g>
    );
  }
  // target
  return (
    <g>
      <circle cx={x} cy={y} r={size * 4} fill="none" stroke="currentColor" strokeWidth={0.4} opacity={0.25} />
      <circle cx={x} cy={y} r={size * 2.4} fill="none" stroke="currentColor" strokeWidth={0.55} opacity={0.55} />
      <circle cx={x} cy={y} r={size * 0.9} fill="currentColor" opacity={0.95} />
      <line x1={x - size * 5} y1={y} x2={x - size * 3.2} y2={y} stroke="currentColor" strokeWidth={0.45} opacity={0.4} />
      <line x1={x + size * 3.2} y1={y} x2={x + size * 5} y2={y} stroke="currentColor" strokeWidth={0.45} opacity={0.4} />
    </g>
  );
};

// --- SceneFrame ------------------------------------------------------------
// Every diorama's root svg wrapper. Applies line color via `color` so every
// descendant inherits via `currentColor`. Emits two monospace corner labels
// (top-left + bottom-right) at opacity 0.35.
export type SceneFrameProps = {
  lineColor: string;
  children: React.ReactNode;
  cornerLabels?: { topLeft?: string; bottomRight?: string };
};

export const SceneFrame: React.FC<SceneFrameProps> = ({
  lineColor,
  children,
  cornerLabels,
}) => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 216 288"
    preserveAspectRatio="xMidYMid meet"
    shapeRendering="geometricPrecision"
    style={{ color: lineColor, display: "block" }}
  >
    {children}
    {cornerLabels?.topLeft && (
      <text
        x={10}
        y={16}
        fontFamily="ui-monospace, monospace"
        fontSize={5}
        letterSpacing="1"
        fill="currentColor"
        opacity={0.45}
        style={{ textTransform: "uppercase" }}
      >
        {cornerLabels.topLeft}
      </text>
    )}
    {cornerLabels?.bottomRight && (
      <text
        x={206}
        y={278}
        fontFamily="ui-monospace, monospace"
        fontSize={5}
        letterSpacing="1"
        textAnchor="end"
        fill="currentColor"
        opacity={0.45}
        style={{ textTransform: "uppercase" }}
      >
        {cornerLabels.bottomRight}
      </text>
    )}
  </svg>
);
