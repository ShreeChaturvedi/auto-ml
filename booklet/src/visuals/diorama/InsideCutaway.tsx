import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, ConstructionLine, iso } from "./primitives";

/**
 * INSIDE — three-floor architectural cutaway. Floor 1 (top): terminal +
 * operator figure + teal chair. Floor 2 (middle): 2 meshed gears + conveyor.
 * Floor 3 (bottom): dashed SANDBOX boundary + docker whale + python scroll
 * + lock. Ink-black ground, cream linework, ONE teal accent (the chair).
 */

const LINE = COLORS.PAPER_WARM;
const TEAL = COLORS.TEAL_EXT;

const SCALE = 1.5;
const OFFSET_X = 100;
const OFFSET_Y = 110;
const P = (x: number, y: number, z = 0) => {
  const p = iso(x, y, z);
  return { sx: p.sx * SCALE + OFFSET_X, sy: p.sy * SCALE + OFFSET_Y };
};

// Each floor gets a thin iso-platform. Floors stacked top-to-bottom: floor 3
// (basement) has the lowest z, floor 1 has the highest.
const FLOOR_W = 44;
const FLOOR_D = 30;
const FLOOR_H = 26;

type Floor = {
  z: number;
  label: string;
  num: string;
};

const FLOORS = [
  { z: 44, label: "CONTROL", num: "1" },
  { z: 22, label: "AGENT LOOP", num: "2" },
  { z: 0, label: "SANDBOX", num: "3" },
] as const satisfies readonly Floor[];

const F1 = FLOORS[0];
const F2 = FLOORS[1];
const F3 = FLOORS[2];

export const InsideCutaway: React.FC = () => {
  const poly = (pts: { sx: number; sy: number }[]) =>
    pts.map((p) => `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`).join(" ");

  // Floor plate corners for reuse
  const floorCorners = (z: number) => {
    const tl = P(-FLOOR_W / 2, -FLOOR_D / 2, z);
    const tr = P(FLOOR_W / 2, -FLOOR_D / 2, z);
    const br = P(FLOOR_W / 2, FLOOR_D / 2, z);
    const bl = P(-FLOOR_W / 2, FLOOR_D / 2, z);
    return { tl, tr, br, bl };
  };

  return (
    <SceneFrame
      lineColor={LINE}
      cornerLabels={{ topLeft: "ARCH · CUT-AWAY", bottomRight: "SANDBOX BOUNDARY" }}
    >
      <defs>
        <pattern id="inside-hatch" patternUnits="userSpaceOnUse" width="4" height="4">
          <path d="M0 4 L4 0" stroke={LINE} strokeWidth={0.4} opacity={0.3} />
        </pattern>
      </defs>

      {/* Section-cut Z-mark in top-left + "A — A'" */}
      <g stroke="currentColor" strokeWidth={0.6} fill="none" opacity={0.55}>
        <line x1={30} y1={28} x2={48} y2={28} />
        <line x1={48} y1={28} x2={36} y2={40} />
        <line x1={36} y1={40} x2={54} y2={40} />
      </g>
      <text
        x={30}
        y={48}
        fontFamily="ui-monospace, monospace"
        fontSize={4.5}
        letterSpacing="1"
        fill="currentColor"
        opacity={0.5}
      >
        A — A&apos;
      </text>

      {/* ---- Outer shell: back wall + left wall silhouette ----------- */}
      {(() => {
        const topC = floorCorners(F1.z + FLOOR_H);
        const botC = floorCorners(F3.z - 3);
        // Back wall polygon (connects top-back to bottom-back)
        return (
          <g>
            {/* Back wall (right-most vertical edge) */}
            <polygon
              points={poly([topC.tr, topC.tl, botC.tl, botC.tr])}
              fill="currentColor"
              fillOpacity={0.04}
              stroke="currentColor"
              strokeWidth={0.7}
              opacity={0.85}
            />
            {/* Left wall (back-left to front-left, the "cut" edge) */}
            <line x1={topC.tl.sx} y1={topC.tl.sy} x2={botC.tl.sx} y2={botC.tl.sy} stroke="currentColor" strokeWidth={0.9} opacity={0.85} />
            {/* Front edge (dashed cutaway) */}
            <line x1={topC.bl.sx} y1={topC.bl.sy} x2={botC.bl.sx} y2={botC.bl.sy} stroke="currentColor" strokeWidth={0.6} strokeDasharray="3 3" opacity={0.55} />
            {/* Right corner edge */}
            <line x1={topC.tr.sx} y1={topC.tr.sy} x2={botC.tr.sx} y2={botC.tr.sy} stroke="currentColor" strokeWidth={0.9} opacity={0.85} />
          </g>
        );
      })()}

      {/* ---- Each floor slab ---------------------------------------- */}
      {FLOORS.map((f, i) => {
        const c = floorCorners(f.z);
        return (
          <g key={i}>
            {/* Top face rhombus of floor */}
            <polygon
              points={poly([c.tl, c.tr, c.br, c.bl])}
              fill="currentColor"
              fillOpacity={0.08}
              stroke="currentColor"
              strokeWidth={1.0}
              strokeLinejoin="round"
            />
            {/* slight shadow strip under floor */}
            <polygon
              points={poly([
                c.bl,
                c.br,
                { sx: c.br.sx, sy: c.br.sy + 2 },
                { sx: c.bl.sx, sy: c.bl.sy + 2 },
              ])}
              fill="currentColor"
              fillOpacity={0.18}
              stroke="currentColor"
              strokeWidth={0.6}
            />
          </g>
        );
      })}

      {/* ---- Floor 1: terminal + operator + teal chair + screen ------ */}
      {(() => {
        const z1 = F1.z;
        // Terminal desk
        const deskO: [number, number, number] = [-18, -8, z1];
        const deskW = 14;
        const deskD = 8;
        const deskH = 6;
        // project cube manually
        const b000 = P(deskO[0], deskO[1], deskO[2]);
        const b100 = P(deskO[0] + deskW, deskO[1], deskO[2]);
        const b010 = P(deskO[0], deskO[1] + deskD, deskO[2]);
        const b110 = P(deskO[0] + deskW, deskO[1] + deskD, deskO[2]);
        const b001 = P(deskO[0], deskO[1], deskO[2] + deskH);
        const b101 = P(deskO[0] + deskW, deskO[1], deskO[2] + deskH);
        const b011 = P(deskO[0], deskO[1] + deskD, deskO[2] + deskH);
        const b111 = P(deskO[0] + deskW, deskO[1] + deskD, deskO[2] + deskH);
        // Monitor
        const monO: [number, number, number] = [-18, -8, z1 + deskH];
        const monW = 14;
        const monD = 1.5;
        const monH = 8;
        const mb000 = P(monO[0], monO[1], monO[2]);
        const mb100 = P(monO[0] + monW, monO[1], monO[2]);
        const mb010 = P(monO[0], monO[1] + monD, monO[2]);
        const mb110 = P(monO[0] + monW, monO[1] + monD, monO[2]);
        const mb001 = P(monO[0], monO[1], monO[2] + monH);
        const mb101 = P(monO[0] + monW, monO[1], monO[2] + monH);
        const mb011 = P(monO[0], monO[1] + monD, monO[2] + monH);
        const mb111 = P(monO[0] + monW, monO[1] + monD, monO[2] + monH);

        // Operator figure — 3 ellipses (head, torso, shoulders) at the chair
        const figX = 8;
        const figY = 4;
        const head = P(figX, figY, z1 + 10);
        const torso = P(figX, figY, z1 + 6);
        const shoulders = P(figX, figY, z1 + 7.5);

        // Chair — L-shape silhouette in TEAL
        const chairSeat = P(figX, figY + 2, z1);
        const chairBackTop = P(figX - 1, figY + 2, z1 + 8);
        const chairSeatFront = P(figX + 3, figY - 1, z1 + 3);

        return (
          <g>
            {/* Desk cube */}
            <polygon points={poly([b001, b101, b111, b011])} fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={0.9} />
            <polygon points={poly([b000, b001, b011, b010])} fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={0.9} />
            <polygon points={poly([b100, b101, b111, b110])} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={0.9} />
            {/* Monitor */}
            <polygon points={poly([mb001, mb101, mb111, mb011])} fill="currentColor" fillOpacity={0.26} stroke="currentColor" strokeWidth={1.1} />
            <polygon points={poly([mb000, mb001, mb011, mb010])} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1.1} />
            <polygon points={poly([mb100, mb101, mb111, mb110])} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={1.1} />
            {/* Screen "play" triangle */}
            {(() => {
              const cx = (mb001.sx + mb111.sx) / 2;
              const cy = (mb001.sy + mb111.sy) / 2;
              return (
                <polygon
                  points={poly([
                    { sx: cx - 1.8, sy: cy - 2 },
                    { sx: cx + 2, sy: cy },
                    { sx: cx - 1.8, sy: cy + 2 },
                  ])}
                  fill="currentColor"
                  opacity={0.95}
                />
              );
            })()}
            {/* code lines on monitor */}
            {[0, 1, 2].map((i) => (
              <line
                key={i}
                x1={mb001.sx + 1.5}
                y1={mb001.sy + 1.5 + i * 1.6}
                x2={mb101.sx - 2 - i}
                y2={mb001.sy + 1.5 + i * 1.6}
                stroke="currentColor"
                strokeWidth={0.4}
                opacity={0.6}
              />
            ))}

            {/* Operator figure */}
            <ellipse cx={torso.sx} cy={torso.sy - 2} rx={2.6} ry={3.6} fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={0.9} />
            <ellipse cx={shoulders.sx} cy={shoulders.sy - 2} rx={3.2} ry={1.2} fill="currentColor" fillOpacity={0.3} stroke="currentColor" strokeWidth={0.6} />
            <circle cx={head.sx} cy={head.sy} r={2.2} fill="currentColor" fillOpacity={0.32} stroke="currentColor" strokeWidth={0.9} />

            {/* Chair — TEAL silhouette (L-shape back+seat) */}
            <g stroke={TEAL} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path
                d={`M ${chairBackTop.sx} ${chairBackTop.sy} L ${chairSeat.sx - 1} ${chairSeat.sy} L ${chairSeatFront.sx} ${chairSeatFront.sy}`}
              />
              <line x1={chairSeatFront.sx + 1} y1={chairSeatFront.sy + 2} x2={chairSeatFront.sx + 1} y2={chairSeatFront.sy + 8} />
              <line x1={chairSeat.sx - 1} y1={chairSeat.sy + 1} x2={chairSeat.sx - 1} y2={chairSeat.sy + 8} />
            </g>
            {/* small teal accent dot at seat hinge */}
            <circle cx={chairSeat.sx} cy={chairSeat.sy} r={1.0} fill={TEAL} />
          </g>
        );
      })()}

      {/* ---- Floor 2: two meshed gears + conveyor ------------------- */}
      {(() => {
        const z2 = F2.z + 2;
        const g1 = P(-12, -4, z2 + 5);
        const g2 = P(-1, 2, z2 + 5);

        const gearPoly = (cx: number, cy: number, r: number, teeth: number, phase = 0) => {
          const pts: string[] = [];
          const total = teeth * 2;
          for (let i = 0; i < total; i++) {
            const rr = i % 2 === 0 ? r : r * 0.78;
            const a = (i / total) * Math.PI * 2 + phase;
            pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr * 0.58).toFixed(2)}`);
          }
          return pts.join(" ");
        };

        const conveyorLeft = P(6, -2, z2);
        const conveyorRight = P(22, 4, z2);

        return (
          <g>
            {/* Floor 2 back wall w/ pipes */}
            <g stroke="currentColor" strokeWidth={0.7} opacity={0.55}>
              <line x1={P(-24, -16, z2 + 2).sx} y1={P(-24, -16, z2 + 2).sy} x2={P(-24, -16, z2 + 14).sx} y2={P(-24, -16, z2 + 14).sy} />
              <line x1={P(-18, -16, z2 + 2).sx} y1={P(-18, -16, z2 + 2).sy} x2={P(-18, -16, z2 + 14).sx} y2={P(-18, -16, z2 + 14).sy} />
              <line x1={P(-24, -16, z2 + 8).sx} y1={P(-24, -16, z2 + 8).sy} x2={P(-18, -16, z2 + 8).sx} y2={P(-18, -16, z2 + 8).sy} />
            </g>

            {/* Big gear - 16 tooth */}
            <polygon
              points={gearPoly(g1.sx, g1.sy, 8, 16)}
              fill="currentColor"
              fillOpacity={0.22}
              stroke="currentColor"
              strokeWidth={1.0}
              strokeLinejoin="round"
            />
            <circle cx={g1.sx} cy={g1.sy} r={3} fill="currentColor" fillOpacity={0.4} stroke="currentColor" strokeWidth={0.7} />
            <circle cx={g1.sx} cy={g1.sy} r={1} fill="currentColor" />

            {/* Small gear - 12 tooth meshing */}
            <polygon
              points={gearPoly(g2.sx, g2.sy, 5.5, 12, Math.PI / 14)}
              fill="currentColor"
              fillOpacity={0.18}
              stroke="currentColor"
              strokeWidth={0.9}
              strokeLinejoin="round"
            />
            <circle cx={g2.sx} cy={g2.sy} r={2.2} fill="currentColor" fillOpacity={0.35} stroke="currentColor" strokeWidth={0.6} />
            <circle cx={g2.sx} cy={g2.sy} r={0.7} fill="currentColor" />

            {/* Arrow from big gear to small gear */}
            <path
              d={`M ${g1.sx + 8} ${g1.sy - 1} Q ${(g1.sx + g2.sx) / 2} ${g1.sy - 9} ${g2.sx - 4} ${g2.sy - 3}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.7}
              opacity={0.6}
              strokeDasharray="2 2"
            />
            <polygon
              points={`${g2.sx - 4},${g2.sy - 3} ${g2.sx - 6},${g2.sy - 4.4} ${g2.sx - 6},${g2.sy - 1.6}`}
              fill="currentColor"
              opacity={0.8}
            />

            {/* Conveyor belt — 3 rollers + belt line */}
            <g stroke="currentColor" strokeWidth={0.9} fill="none">
              <line x1={conveyorLeft.sx} y1={conveyorLeft.sy} x2={conveyorRight.sx} y2={conveyorRight.sy} />
              <line x1={conveyorLeft.sx + 1} y1={conveyorLeft.sy + 2} x2={conveyorRight.sx + 1} y2={conveyorRight.sy + 2} />
              {[0, 1, 2].map((i) => {
                const t = i / 2;
                const cx = conveyorLeft.sx + (conveyorRight.sx - conveyorLeft.sx) * t;
                const cy = conveyorLeft.sy + (conveyorRight.sy - conveyorLeft.sy) * t + 1;
                return <circle key={i} cx={cx} cy={cy} r={1.3} fill="currentColor" fillOpacity={0.3} stroke="currentColor" strokeWidth={0.7} />;
              })}
              {/* packet on belt */}
              <rect x={conveyorLeft.sx + 7} y={conveyorLeft.sy - 2} width={3} height={2.6} fill="currentColor" opacity={0.75} />
            </g>
          </g>
        );
      })()}

      {/* ---- Dashed SANDBOX boundary (floor 2-3 separator) ------------ */}
      {(() => {
        const c = floorCorners(F2.z - 2);
        return (
          <g>
            <polygon
              points={poly([c.tl, c.tr, c.br, c.bl])}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.0}
              strokeDasharray="5 3"
              opacity={0.85}
            />
            {/* SANDBOX label */}
            <text
              x={c.bl.sx + 4}
              y={c.bl.sy - 1.5}
              fontFamily="ui-monospace, monospace"
              fontSize={4.4}
              letterSpacing="1.2"
              fill="currentColor"
              opacity={0.85}
            >
              SANDBOX
            </text>
          </g>
        );
      })()}

      {/* ---- Floor 3: docker whale + python scroll + lock ------------ */}
      {(() => {
        const z3 = F3.z + 2;
        const docker = P(-14, -2, z3);
        const python = P(2, 2, z3);
        const lock = P(14, -6, z3 + 3);

        return (
          <g>
            {/* Foundation hatch on the floor 3 back wall */}
            {(() => {
              const c = floorCorners(F3.z);
              const backW = c.tr.sx - c.tl.sx;
              return (
                <rect
                  x={c.tl.sx}
                  y={c.tl.sy - 12}
                  width={backW}
                  height={12}
                  fill="url(#inside-hatch)"
                  opacity={0.75}
                />
              );
            })()}

            {/* Docker whale — 3 stacked containers on a hull */}
            <g>
              {/* Hull */}
              <path
                d={`M ${docker.sx - 5} ${docker.sy + 2.5} q 5 3 12 0 l -1 2 q -5 2 -10 0 z`}
                fill="currentColor"
                fillOpacity={0.4}
                stroke="currentColor"
                strokeWidth={0.9}
              />
              {/* Tail fluke */}
              <path
                d={`M ${docker.sx - 5.5} ${docker.sy + 2.5} l -1.5 -1 l 0 2 z`}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={0.6}
              />
              {/* 3 containers */}
              {[0, 1, 2].map((i) => (
                <rect
                  key={i}
                  x={docker.sx - 4 + i * 3}
                  y={docker.sy - 1.5 - (i === 1 ? 2.5 : 0)}
                  width={2.5}
                  height={3}
                  fill="currentColor"
                  fillOpacity={0.55}
                  stroke="currentColor"
                  strokeWidth={0.7}
                />
              ))}
              {/* eye */}
              <circle cx={docker.sx + 5.5} cy={docker.sy + 2.8} r={0.4} fill="currentColor" />
              {/* Docker label */}
              <text
                x={docker.sx - 6}
                y={docker.sy + 8}
                fontFamily="ui-monospace, monospace"
                fontSize={3.2}
                letterSpacing="0.8"
                fill="currentColor"
                opacity={0.55}
              >
                DOCKER
              </text>
            </g>

            {/* Python scroll */}
            <g>
              <polygon
                points={poly([
                  { sx: python.sx, sy: python.sy - 4 },
                  { sx: python.sx + 8, sy: python.sy - 4 },
                  { sx: python.sx + 8, sy: python.sy + 4 },
                  { sx: python.sx, sy: python.sy + 4 },
                ])}
                fill="currentColor"
                fillOpacity={0.2}
                stroke="currentColor"
                strokeWidth={0.9}
                strokeLinejoin="round"
              />
              {/* fold */}
              <polygon
                points={`${python.sx + 5.5},${python.sy - 4} ${python.sx + 8},${python.sy - 1.5} ${python.sx + 5.5},${python.sy - 1.5}`}
                fill="currentColor"
                fillOpacity={0.4}
                stroke="currentColor"
                strokeWidth={0.6}
              />
              {/* code lines */}
              {[0, 1, 2].map((i) => (
                <line
                  key={i}
                  x1={python.sx + 1}
                  y1={python.sy + i * 1.5}
                  x2={python.sx + 6 - i}
                  y2={python.sy + i * 1.5}
                  stroke="currentColor"
                  strokeWidth={0.4}
                  opacity={0.7}
                />
              ))}
              <text
                x={python.sx}
                y={python.sy + 7}
                fontFamily="ui-monospace, monospace"
                fontSize={3.2}
                letterSpacing="0.8"
                fill="currentColor"
                opacity={0.55}
              >
                .PY
              </text>
            </g>

            {/* Lock */}
            <g>
              <path
                d={`M ${lock.sx - 1.5} ${lock.sy} q 0 -2.5 1.5 -2.5 q 1.5 0 1.5 2.5`}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.9}
              />
              <rect x={lock.sx - 2} y={lock.sy} width={4} height={3.5} rx={0.4} fill="currentColor" fillOpacity={0.35} stroke="currentColor" strokeWidth={0.9} />
              <circle cx={lock.sx} cy={lock.sy + 1.6} r={0.4} fill="currentColor" />
            </g>
          </g>
        );
      })()}

      {/* ---- Floor labels 1/2/3 on right edge ----------------------- */}
      {FLOORS.map((f, i) => {
        const c = floorCorners(f.z);
        const lblX = Math.min(c.tr.sx + 8, 198);
        return (
          <g key={`label-${i}`}>
            {/* leader tick */}
            <line
              x1={c.tr.sx + 2}
              y1={c.tr.sy + 4}
              x2={lblX - 2}
              y2={c.tr.sy + 4}
              stroke="currentColor"
              strokeWidth={0.4}
              opacity={0.4}
            />
            <text
              x={lblX}
              y={c.tr.sy + 2}
              fontFamily="ui-monospace, monospace"
              fontSize={5.5}
              fontWeight={700}
              letterSpacing="1"
              fill="currentColor"
              opacity={0.95}
            >
              F{f.num}
            </text>
            <text
              x={lblX}
              y={c.tr.sy + 8}
              fontFamily="ui-monospace, monospace"
              fontSize={3.6}
              letterSpacing="0.8"
              fill="currentColor"
              opacity={0.65}
            >
              {f.label}
            </text>
          </g>
        );
      })}

      {/* ---- Ruler ticks on left edge -------------------------------- */}
      {(() => {
        const ticks = [F1.z + FLOOR_H, F1.z, F2.z, F3.z, F3.z - 4];
        return ticks.map((z, i) => {
          const p = P(-FLOOR_W / 2 - 1, -FLOOR_D / 2, z);
          return (
            <g key={i}>
              <line x1={p.sx - 8} y1={p.sy} x2={p.sx} y2={p.sy} stroke="currentColor" strokeWidth={0.4} opacity={0.35} />
              <circle cx={p.sx - 8} cy={p.sy} r={0.7} fill="currentColor" opacity={0.45} />
            </g>
          );
        });
      })()}

      {/* ---- Leader line: operator -> gear (dashed)  --------------- */}
      {(() => {
        const opPt = P(8, 4, F1.z + 4);
        const gearPt = P(-12, -4, F2.z + 10);
        return (
          <ConstructionLine
            from={[opPt.sx, opPt.sy]}
            to={[gearPt.sx, gearPt.sy]}
            tick="both"
            opacity={0.45}
            strokeWidth={0.5}
            dashPattern="4 3"
          />
        );
      })()}

      {/* ---- Gear -> sandbox leader (solid) ------------------------- */}
      {(() => {
        const gearPt = P(-1, 2, F2.z + 5);
        const sandboxPt = P(0, 0, F3.z + 8);
        return (
          <line
            x1={gearPt.sx}
            y1={gearPt.sy}
            x2={sandboxPt.sx}
            y2={sandboxPt.sy}
            stroke="currentColor"
            strokeWidth={0.6}
            opacity={0.4}
          />
        );
      })()}
    </SceneFrame>
  );
};
