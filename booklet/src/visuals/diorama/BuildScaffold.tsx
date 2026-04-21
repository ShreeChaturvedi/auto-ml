import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, ConstructionLine, iso } from "./primitives";

/**
 * BUILD — 4-tier scaffold tower. S6 (solid, done) → S7 (framed with trusses)
 * → S8 (scaffolded, partial walls) → S9 (blueprint, all-dashed). Tools at
 * base, worker on S7 level, crane hook descending. Four dimension callouts.
 *
 * Amber ground, cream linework.
 */

const LINE = COLORS.PAPER_WARM;

const SCALE = 1.7;
const OFFSET_X = 88;
const OFFSET_Y = 248;
const P = (x: number, y: number, z = 0) => {
  const p = iso(x, y, z);
  return { sx: p.sx * SCALE + OFFSET_X, sy: p.sy * SCALE + OFFSET_Y };
};

const poly = (pts: { sx: number; sy: number }[]) =>
  pts.map((p) => `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`).join(" ");

// Scaled iso cube
const SCube: React.FC<{
  origin: [number, number, number];
  size: [number, number, number];
  face?: { top: number; left: number; right: number };
  strokeWidth?: number;
  dashed?: boolean;
  dashPattern?: string;
}> = ({ origin: [ox, oy, oz], size: [w, d, h], face = { top: 0.22, left: 0.14, right: 0.08 }, strokeWidth = 0.9, dashed = false, dashPattern = "3 3" }) => {
  const p000 = P(ox, oy, oz);
  const p100 = P(ox + w, oy, oz);
  const p010 = P(ox, oy + d, oz);
  const p110 = P(ox + w, oy + d, oz);
  const p001 = P(ox, oy, oz + h);
  const p101 = P(ox + w, oy, oz + h);
  const p011 = P(ox, oy + d, oz + h);
  const p111 = P(ox + w, oy + d, oz + h);
  const ext = dashed ? { strokeDasharray: dashPattern } : {};
  return (
    <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" {...ext}>
      <polygon points={poly([p001, p101, p111, p011])} fill="currentColor" fillOpacity={face.top} />
      <polygon points={poly([p000, p001, p011, p010])} fill="currentColor" fillOpacity={face.left} />
      <polygon points={poly([p100, p101, p111, p110])} fill="currentColor" fillOpacity={face.right} />
    </g>
  );
};

export const BuildScaffold: React.FC = () => {
  // Tower footprint
  const fpW = 26;
  const fpD = 17;
  const tierH = 12;
  const tierX = -fpW / 2;
  const tierY = -fpD / 2;

  const S6: [number, number, number] = [tierX, tierY, 0];
  const S7: [number, number, number] = [tierX, tierY, tierH];
  const S8: [number, number, number] = [tierX, tierY, tierH * 2];
  const S9: [number, number, number] = [tierX, tierY, tierH * 3];

  return (
    <SceneFrame
      lineColor={LINE}
      cornerLabels={{ topLeft: "BUILD · SPRINT STACK", bottomRight: "S9 · IN PROGRESS" }}
    >
      {/* Ground plane */}
      {(() => {
        const o = P(-40, -30, 0);
        const a = P(-40 + 80, -30, 0);
        const b = P(-40 + 80, -30 + 60, 0);
        const c = P(-40, -30 + 60, 0);
        return (
          <polygon
            points={poly([o, a, b, c])}
            fill="currentColor"
            fillOpacity={0.04}
            stroke="currentColor"
            strokeWidth={0.5}
            strokeOpacity={0.3}
          />
        );
      })()}

      {/* Foundation slab */}
      {(() => {
        const s = 2;
        const a = P(tierX - s, tierY - s, 0);
        const b = P(tierX + fpW + s, tierY - s, 0);
        const c = P(tierX + fpW + s, tierY + fpD + s, 0);
        const d = P(tierX - s, tierY + fpD + s, 0);
        return (
          <polygon
            points={poly([a, b, c, d])}
            fill="currentColor"
            fillOpacity={0.22}
            stroke="currentColor"
            strokeWidth={1.0}
            strokeLinejoin="round"
          />
        );
      })()}

      {/* --- S6: solid --- */}
      <SCube
        origin={S6}
        size={[fpW, fpD, tierH]}
        face={{ top: 0.32, left: 0.22, right: 0.14 }}
        strokeWidth={1.4}
      />
      {/* S6 plaque on front face */}
      {(() => {
        const a = P(tierX + 3, tierY + fpD, S6[2] + tierH * 0.28);
        const b = P(tierX + 10, tierY + fpD, S6[2] + tierH * 0.28);
        const c = P(tierX + 10, tierY + fpD, S6[2] + tierH * 0.68);
        const d = P(tierX + 3, tierY + fpD, S6[2] + tierH * 0.68);
        return (
          <g>
            <polygon points={poly([a, b, c, d])} fill="currentColor" fillOpacity={0.45} stroke="currentColor" strokeWidth={0.8} />
            <text
              x={(a.sx + c.sx) / 2}
              y={(a.sy + c.sy) / 2 + 1.8}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
              fontSize={4.8}
              fontWeight={700}
              letterSpacing="1"
              fill="currentColor"
            >
              S6
            </text>
          </g>
        );
      })()}

      {/* --- S7: stroked frame with trusses --- */}
      <SCube
        origin={S7}
        size={[fpW, fpD, tierH]}
        face={{ top: 0.14, left: 0.05, right: 0.03 }}
        strokeWidth={1.4}
      />
      {/* Trusses */}
      {(() => {
        const bl = P(tierX, tierY, S7[2]);
        const br = P(tierX + fpW, tierY, S7[2]);
        const fl = P(tierX, tierY + fpD, S7[2]);
        const btl = P(tierX, tierY, S7[2] + tierH);
        const btr = P(tierX + fpW, tierY, S7[2] + tierH);
        const bfr = P(tierX + fpW, tierY + fpD, S7[2] + tierH);
        return (
          <g stroke="currentColor" strokeWidth={0.7} opacity={0.65}>
            <line x1={bl.sx} y1={bl.sy} x2={btr.sx} y2={btr.sy} strokeDasharray="2 2" />
            <line x1={br.sx} y1={br.sy} x2={btl.sx} y2={btl.sy} strokeDasharray="2 2" />
            <line x1={fl.sx} y1={fl.sy} x2={bfr.sx} y2={bfr.sy} strokeDasharray="2 2" />
          </g>
        );
      })()}
      {/* S7 plaque */}
      {(() => {
        const a = P(tierX + 3, tierY + fpD, S7[2] + tierH * 0.28);
        const b = P(tierX + 10, tierY + fpD, S7[2] + tierH * 0.28);
        const c = P(tierX + 10, tierY + fpD, S7[2] + tierH * 0.68);
        const d = P(tierX + 3, tierY + fpD, S7[2] + tierH * 0.68);
        return (
          <g>
            <polygon points={poly([a, b, c, d])} fill="currentColor" fillOpacity={0.3} stroke="currentColor" strokeWidth={0.8} />
            <text
              x={(a.sx + c.sx) / 2}
              y={(a.sy + c.sy) / 2 + 1.8}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
              fontSize={4.8}
              fontWeight={700}
              letterSpacing="1"
              fill="currentColor"
            >
              S7
            </text>
          </g>
        );
      })()}
      {/* Worker figure on S7 floor */}
      {(() => {
        const wx = tierX + fpW * 0.7;
        const wy = tierY + fpD * 0.4;
        const feet = P(wx, wy, S7[2] + tierH);
        const shoulders = P(wx, wy, S7[2] + tierH + 5);
        const head = P(wx, wy, S7[2] + tierH + 8);
        return (
          <g>
            <ellipse cx={shoulders.sx} cy={shoulders.sy + 1} rx={2.2} ry={3.2} fill="currentColor" fillOpacity={0.45} stroke="currentColor" strokeWidth={0.8} />
            <circle cx={head.sx} cy={head.sy} r={2} fill="currentColor" fillOpacity={0.55} stroke="currentColor" strokeWidth={0.8} />
            <path d={`M ${head.sx - 2.4} ${head.sy - 0.8} q 2.4 -2.2 4.8 0`} fill="currentColor" fillOpacity={0.7} stroke="currentColor" strokeWidth={0.7} />
            <line x1={head.sx - 2.8} y1={head.sy - 0.6} x2={head.sx + 2.8} y2={head.sy - 0.6} stroke="currentColor" strokeWidth={0.8} />
            <line x1={shoulders.sx - 1.2} y1={shoulders.sy + 3} x2={feet.sx - 1.5} y2={feet.sy} stroke="currentColor" strokeWidth={0.9} />
            <line x1={shoulders.sx + 1.2} y1={shoulders.sy + 3} x2={feet.sx + 1.5} y2={feet.sy} stroke="currentColor" strokeWidth={0.9} />
          </g>
        );
      })()}

      {/* --- S8: partial walls + scaffolding --- */}
      {(() => {
        const b000 = P(S8[0], S8[1], S8[2]);
        const b100 = P(S8[0] + fpW, S8[1], S8[2]);
        const b010 = P(S8[0], S8[1] + fpD, S8[2]);
        const b110 = P(S8[0] + fpW, S8[1] + fpD, S8[2]);
        const b001 = P(S8[0], S8[1], S8[2] + tierH);
        const b101 = P(S8[0] + fpW, S8[1], S8[2] + tierH);
        const b011 = P(S8[0], S8[1] + fpD, S8[2] + tierH);

        return (
          <g>
            {/* Back wall */}
            <polygon points={poly([b000, b100, b101, b001])} fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={1.0} strokeLinejoin="round" />
            {/* Left wall */}
            <polygon points={poly([b000, b010, b011, b001])} fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={1.0} strokeLinejoin="round" />
            {/* Scaffolding: front-left pole */}
            <line x1={b010.sx - 3} y1={b010.sy - 1} x2={b010.sx - 3} y2={b010.sy - tierH * SCALE - 4} stroke="currentColor" strokeWidth={1.0} />
            {/* Pole front-right */}
            <line x1={b110.sx + 3} y1={b110.sy - 1} x2={b110.sx + 3} y2={b110.sy - tierH * SCALE - 4} stroke="currentColor" strokeWidth={1.0} />
            {/* Crossbar top */}
            <line x1={b010.sx - 3} y1={b010.sy - tierH * SCALE - 2} x2={b110.sx + 3} y2={b110.sy - tierH * SCALE - 2} stroke="currentColor" strokeWidth={0.8} />
            {/* Crossbar middle */}
            <line x1={b010.sx - 3} y1={b010.sy - tierH * SCALE / 2} x2={b110.sx + 3} y2={b110.sy - tierH * SCALE / 2} stroke="currentColor" strokeWidth={0.8} />
            {/* Diagonal brace */}
            <line x1={b010.sx - 3} y1={b010.sy - tierH * SCALE / 2} x2={b110.sx + 3} y2={b110.sy - 1} stroke="currentColor" strokeWidth={0.6} strokeDasharray="2 2" opacity={0.7} />
            {/* Planks (3 narrow rects on scaffold) */}
            {[0, 1, 2].map((i) => {
              const y = b010.sy - tierH * SCALE / 3 * 2 - i * 0.5;
              return (
                <rect
                  key={i}
                  x={b010.sx - 3 + i * 10}
                  y={y}
                  width={10}
                  height={1.4}
                  fill="currentColor"
                  fillOpacity={0.55}
                  stroke="currentColor"
                  strokeWidth={0.6}
                />
              );
            })}

            {/* S8 plaque */}
            {(() => {
              const a = P(S8[0] + 3, S8[1] + fpD, S8[2] + tierH * 0.28);
              const bb = P(S8[0] + 10, S8[1] + fpD, S8[2] + tierH * 0.28);
              const c = P(S8[0] + 10, S8[1] + fpD, S8[2] + tierH * 0.68);
              const d = P(S8[0] + 3, S8[1] + fpD, S8[2] + tierH * 0.68);
              return (
                <g>
                  <polygon points={poly([a, bb, c, d])} fill="currentColor" fillOpacity={0.3} stroke="currentColor" strokeWidth={0.8} />
                  <text
                    x={(a.sx + c.sx) / 2}
                    y={(a.sy + c.sy) / 2 + 1.8}
                    textAnchor="middle"
                    fontFamily="ui-monospace, monospace"
                    fontSize={4.8}
                    fontWeight={700}
                    letterSpacing="1"
                    fill="currentColor"
                  >
                    S8
                  </text>
                </g>
              );
            })()}
          </g>
        );
      })()}

      {/* --- S9: blueprint, all-dashed --- */}
      <SCube
        origin={S9}
        size={[fpW, fpD, tierH]}
        face={{ top: 0.08, left: 0.03, right: 0.02 }}
        strokeWidth={1.2}
        dashed
        dashPattern="3 3"
      />
      {/* S9 plaque */}
      {(() => {
        const a = P(S9[0] + 3, S9[1] + fpD, S9[2] + tierH * 0.28);
        const b = P(S9[0] + 10, S9[1] + fpD, S9[2] + tierH * 0.28);
        const c = P(S9[0] + 10, S9[1] + fpD, S9[2] + tierH * 0.68);
        const d = P(S9[0] + 3, S9[1] + fpD, S9[2] + tierH * 0.68);
        return (
          <g>
            <polygon points={poly([a, b, c, d])} fill="none" stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 2" />
            <text
              x={(a.sx + c.sx) / 2}
              y={(a.sy + c.sy) / 2 + 1.8}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
              fontSize={4.8}
              fontWeight={700}
              letterSpacing="1"
              fill="currentColor"
            >
              S9
            </text>
          </g>
        );
      })()}
      {/* "IN PROGRESS" on top of S9 */}
      {(() => {
        const p = P(S9[0] + fpW / 2, S9[1] + fpD / 2, S9[2] + tierH + 4);
        return (
          <text
            x={p.sx}
            y={p.sy}
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
            fontSize={3.6}
            letterSpacing="0.8"
            fontWeight={600}
            fill="currentColor"
            opacity={0.85}
          >
            IN PROGRESS
          </text>
        );
      })()}

      {/* Crane — boom angled from top-left coming down to above S9 */}
      {(() => {
        const hookEnd = P(S9[0] + fpW * 0.7, S9[1] + fpD * 0.5, S9[2] + tierH + 6);
        const boomEnd = P(S9[0] + fpW * 0.7, S9[1] + fpD * 0.5, S9[2] + tierH + 22);
        const pivot = { sx: 42, sy: 46 };
        return (
          <g>
            {/* Boom */}
            <line x1={pivot.sx} y1={pivot.sy} x2={boomEnd.sx} y2={boomEnd.sy} stroke="currentColor" strokeWidth={1.1} />
            {/* Cable (dashed, short) */}
            <line
              x1={boomEnd.sx}
              y1={boomEnd.sy}
              x2={hookEnd.sx}
              y2={hookEnd.sy}
              stroke="currentColor"
              strokeWidth={0.5}
              strokeDasharray="1 2"
              opacity={0.75}
            />
            {/* Hook */}
            <path
              d={`M ${hookEnd.sx - 1} ${hookEnd.sy} l 0 2.5 q 0 2 2 2 q 2 0 2 -2 l 0 -1`}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.9}
            />
            {/* Pivot dot */}
            <circle cx={pivot.sx} cy={pivot.sy} r={1.2} fill="currentColor" opacity={0.8} />
          </g>
        );
      })()}

      {/* Tool pile at base — positioned to left of foundation so it stays in canvas */}
      {(() => {
        const toolsX = tierX - 20;
        const toolsY = tierY + fpD - 2;
        // Toolbox
        const tb: [number, number, number] = [toolsX, toolsY, 0];
        const beam1: [number, number, number] = [toolsX - 22, toolsY + 4, 0];
        return (
          <g>
            {/* Toolbox */}
            <SCube
              origin={tb}
              size={[7, 4, 3]}
              face={{ top: 0.38, left: 0.22, right: 0.12 }}
              strokeWidth={1.0}
            />
            {(() => {
              const c = P(toolsX + 3.5, toolsY + 2, 3.5);
              return (
                <path
                  d={`M ${c.sx - 2} ${c.sy} q 2 -1.6 4 0`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={0.8}
                />
              );
            })()}
            {/* Hammer */}
            {(() => {
              const a = P(toolsX - 9, toolsY + 5, 0.5);
              const b = P(toolsX - 2, toolsY + 7, 0.5);
              return (
                <g>
                  <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                  <rect x={a.sx - 2} y={a.sy - 1.5} width={3.6} height={2.8} fill="currentColor" opacity={0.85} transform={`rotate(20 ${a.sx} ${a.sy})`} />
                </g>
              );
            })()}
            {/* Wrench */}
            {(() => {
              const s = P(toolsX + 9, toolsY + 4, 0.5);
              return (
                <g>
                  <path
                    d={`M ${s.sx} ${s.sy} q 3 2 6 0 m -6 0 q 0 -1.5 1 -2 q 2 0 2 2 m 0 0 q 0 1.5 -1 2 q -2 0 -2 -2`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.1}
                  />
                  <circle cx={s.sx + 1} cy={s.sy} r={0.7} fill="currentColor" />
                </g>
              );
            })()}
            {/* Beams — 3 stacked */}
            {[0, 1, 2].map((i) => {
              const h = i * 1.5;
              const oy = beam1[1] + i * 0.3;
              const a = P(beam1[0], oy, h);
              const b = P(beam1[0] + 8, oy, h);
              const c = P(beam1[0] + 8, oy + 1.8, h);
              const d = P(beam1[0], oy + 1.8, h);
              return (
                <polygon
                  key={i}
                  points={poly([a, b, c, d])}
                  fill="currentColor"
                  fillOpacity={0.35 - i * 0.06}
                  stroke="currentColor"
                  strokeWidth={0.8}
                  strokeLinejoin="round"
                />
              );
            })}
          </g>
        );
      })()}

      {/* Dimension callouts on right margin */}
      {(() => {
        const items = [
          { z: S6[2] + tierH / 2, label: "S6" },
          { z: S7[2] + tierH / 2, label: "S7" },
          { z: S8[2] + tierH / 2, label: "S8" },
          { z: S9[2] + tierH / 2, label: "S9" },
        ];
        return (
          <g>
            {items.map((it, i) => {
              const edge = P(tierX + fpW, tierY, it.z);
              return (
                <ConstructionLine
                  key={i}
                  from={[edge.sx + 4, edge.sy]}
                  to={[196, edge.sy]}
                  label={`${it.label} · 14ft`}
                  tick="start"
                  strokeWidth={0.5}
                  dashPattern="3 2"
                  fontSize={4}
                  opacity={0.7}
                  labelOffset={[-36, -1.5]}
                />
              );
            })}
          </g>
        );
      })()}
    </SceneFrame>
  );
};
