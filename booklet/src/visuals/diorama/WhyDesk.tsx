import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, ConstructionLine, iso } from "./primitives";

/**
 * WHY — a cluttered data scientist's desk. The visual joke: 19 non-modeling
 * artifacts and one tiny CSV icon (the ONE real ML task). A dashed leader
 * points from the CSV card to the bottom-right "1 OF 20 · ML" caption.
 *
 * Miami Red ground, cream linework. viewBox 216 x 288.
 */

const LINE = COLORS.PAPER_WARM;

// Canvas 216x288. Scale and offset so the scene fills the viewBox with a
// small margin and the chair silhouette crops at the left edge intentionally.
const SCALE = 2.0;
const OFFSET_X = 118;
const OFFSET_Y = 150;
const P = (x: number, y: number, z = 0) => {
  const p = iso(x, y, z);
  return { sx: p.sx * SCALE + OFFSET_X, sy: p.sy * SCALE + OFFSET_Y };
};

// Convenience for projected polygons
const poly = (pts: { sx: number; sy: number }[]) =>
  pts.map((p) => `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`).join(" ");

const Ellipse: React.FC<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fillOpacity?: number;
  strokeWidth?: number;
  dashed?: boolean;
}> = ({ cx, cy, rx, ry, fillOpacity = 0, strokeWidth = 0.9, dashed = false }) => (
  <ellipse
    cx={cx}
    cy={cy}
    rx={rx}
    ry={ry}
    fill={fillOpacity > 0 ? "currentColor" : "none"}
    fillOpacity={fillOpacity}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    {...(dashed ? { strokeDasharray: "2 2" } : {})}
  />
);

// Manually projected iso-cube for scenes where we need SCALE.
const ScaledIsoCube: React.FC<{
  origin: [number, number, number];
  size: [number, number, number];
  face?: { top: number; left: number; right: number };
  strokeWidth?: number;
  dashed?: boolean;
}> = ({ origin: [ox, oy, oz], size: [w, d, h], face = { top: 0.22, left: 0.14, right: 0.08 }, strokeWidth = 0.9, dashed = false }) => {
  const p000 = P(ox, oy, oz);
  const p100 = P(ox + w, oy, oz);
  const p010 = P(ox, oy + d, oz);
  const p110 = P(ox + w, oy + d, oz);
  const p001 = P(ox, oy, oz + h);
  const p101 = P(ox + w, oy, oz + h);
  const p011 = P(ox, oy + d, oz + h);
  const p111 = P(ox + w, oy + d, oz + h);

  return (
    <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" {...(dashed ? { strokeDasharray: "3 3" } : {})}>
      {/* top */}
      <polygon points={poly([p001, p101, p111, p011])} fill="currentColor" fillOpacity={face.top} />
      {/* left face */}
      <polygon points={poly([p000, p001, p011, p010])} fill="currentColor" fillOpacity={face.left} />
      {/* right face */}
      <polygon points={poly([p100, p101, p111, p110])} fill="currentColor" fillOpacity={face.right} />
    </g>
  );
};

export const WhyDesk: React.FC = () => {
  // Desk rhombus (big, centered)
  const desk = { o: [-34, -24, 0] as [number, number, number], w: 70, d: 48 };
  const deskTL = P(desk.o[0], desk.o[1]);
  const deskTR = P(desk.o[0] + desk.w, desk.o[1]);
  const deskBR = P(desk.o[0] + desk.w, desk.o[1] + desk.d);
  const deskBL = P(desk.o[0], desk.o[1] + desk.d);

  // Laptop (centre-left, hero piece)
  const laptopO: [number, number, number] = [-28, -12, 0];
  const laptopW = 26;
  const laptopD = 18;
  const laptopBaseH = 1.6;
  const screenH = 16;
  const tipBack = 3;
  const backLeft = P(laptopO[0], laptopO[1], laptopBaseH);
  const backRight = P(laptopO[0] + laptopW, laptopO[1], laptopBaseH);
  const screenBackLeft = P(laptopO[0] - tipBack, laptopO[1] - tipBack, laptopBaseH + screenH);
  const screenBackRight = P(laptopO[0] + laptopW - tipBack, laptopO[1] - tipBack, laptopBaseH + screenH);

  // Mug (right of laptop)
  const mug = P(16, -10, 0);
  const mugTop = P(16, -10, 10);

  // Headphones (front-center)
  const phones = P(-18, 16, 0.3);

  // Pen angled across desk
  const penA = P(-2, 12, 0.8);
  const penB = P(18, 6, 0.8);

  // Paper wad (right)
  const wad = P(22, 10, 0);

  // Lamp (back left)
  const lampBase = P(-28, -20, 0);
  const lampArm1 = P(-28, -20, 14);
  const lampArm2 = P(-22, -17, 17);

  // Books stack (right back)
  const book1O: [number, number, number] = [16, -22, 0];

  // CSV card — THE joke. Smallest object, top-right of desk.
  const csvO: [number, number, number] = [24, -22, 0.5];
  const csvW = 10;
  const csvH = 7;
  const csvTL = P(csvO[0], csvO[1], csvO[2]);
  const csvTR = P(csvO[0] + csvW, csvO[1], csvO[2]);
  const csvBR = P(csvO[0] + csvW, csvO[1] + csvH, csvO[2]);
  const csvBL = P(csvO[0], csvO[1] + csvH, csvO[2]);
  const csvCenter = {
    sx: (csvTL.sx + csvBR.sx) / 2,
    sy: (csvTL.sy + csvBR.sy) / 2,
  };

  // Desk thickness (under front edge)
  const deskThickness = 5;

  return (
    <SceneFrame
      lineColor={LINE}
      cornerLabels={{ topLeft: "ENV · DAY-TO-DAY", bottomRight: "1 OF 20 · ML" }}
    >
      {/* Desk plane top surface */}
      <polygon
        points={poly([deskTL, deskTR, deskBR, deskBL])}
        fill="currentColor"
        fillOpacity={0.1}
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {/* Desk front edge thickness */}
      <polygon
        points={poly([
          deskBL,
          deskBR,
          { sx: deskBR.sx, sy: deskBR.sy + deskThickness },
          { sx: deskBL.sx, sy: deskBL.sy + deskThickness },
        ])}
        fill="currentColor"
        fillOpacity={0.22}
        stroke="currentColor"
        strokeWidth={1.0}
      />
      {/* Desk right-side thickness */}
      <polygon
        points={poly([
          deskBR,
          deskTR,
          { sx: deskTR.sx, sy: deskTR.sy + deskThickness },
          { sx: deskBR.sx, sy: deskBR.sy + deskThickness },
        ])}
        fill="currentColor"
        fillOpacity={0.12}
        stroke="currentColor"
        strokeWidth={0.8}
      />

      {/* Chair silhouette — cropped at left edge, feels like peering in */}
      <g stroke="currentColor" strokeWidth={1.1} fill="none" strokeLinecap="round" opacity={0.8}>
        <line x1={Math.max(deskBL.sx - 20, 4)} y1={deskBL.sy + deskThickness + 10} x2={deskBL.sx - 4} y2={deskBL.sy + deskThickness + 4} />
        <line x1={Math.max(deskBL.sx - 20, 4)} y1={deskBL.sy + deskThickness + 10} x2={Math.max(deskBL.sx - 24, 2)} y2={deskBL.sy + deskThickness + 36} />
        <line x1={deskBL.sx - 4} y1={deskBL.sy + deskThickness + 4} x2={deskBL.sx - 6} y2={deskBL.sy + deskThickness + 30} />
        <line x1={Math.max(deskBL.sx - 24, 2)} y1={deskBL.sy + deskThickness + 36} x2={deskBL.sx - 4} y2={deskBL.sy + deskThickness + 26} />
        <circle cx={Math.max(deskBL.sx - 24, 2)} cy={deskBL.sy + deskThickness + 40} r={1.6} fill="currentColor" opacity={0.5} />
      </g>

      {/* Laptop base */}
      <ScaledIsoCube
        origin={laptopO}
        size={[laptopW, laptopD, laptopBaseH]}
        face={{ top: 0.14, left: 0.14, right: 0.08 }}
        strokeWidth={1.6}
      />
      {/* Keyboard ticks on laptop top */}
      {(() => {
        const top = laptopBaseH;
        const lines: React.ReactElement[] = [];
        for (let r = 0; r < 3; r++) {
          const ya = P(laptopO[0] + 4, laptopO[1] + 6 + r * 3, top);
          const yb = P(laptopO[0] + laptopW - 4, laptopO[1] + 6 + r * 3, top);
          lines.push(
            <line
              key={r}
              x1={ya.sx}
              y1={ya.sy}
              x2={yb.sx}
              y2={yb.sy}
              stroke="currentColor"
              strokeWidth={0.4}
              opacity={0.4}
            />,
          );
        }
        // trackpad (small rect on front edge of laptop top)
        const tpA = P(laptopO[0] + laptopW / 2 - 5, laptopO[1] + laptopD - 4, top);
        const tpB = P(laptopO[0] + laptopW / 2 + 5, laptopO[1] + laptopD - 4, top);
        const tpC = P(laptopO[0] + laptopW / 2 + 5, laptopO[1] + laptopD - 1.5, top);
        const tpD = P(laptopO[0] + laptopW / 2 - 5, laptopO[1] + laptopD - 1.5, top);
        lines.push(
          <polygon key="tp" points={poly([tpA, tpB, tpC, tpD])} fill="currentColor" fillOpacity={0.15} stroke="currentColor" strokeWidth={0.5} />,
        );
        return <g>{lines}</g>;
      })()}

      {/* Laptop screen — tilted back */}
      <polygon
        points={poly([backLeft, backRight, screenBackRight, screenBackLeft])}
        fill="currentColor"
        fillOpacity={0.2}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* Screen inner bezel + content */}
      {(() => {
        const inset = 2.0;
        const iTL = { sx: backLeft.sx + inset, sy: backLeft.sy - inset };
        const iTR = { sx: backRight.sx - inset, sy: backRight.sy - inset };
        const iBR = { sx: screenBackRight.sx - inset, sy: screenBackRight.sy + inset };
        const iBL = { sx: screenBackLeft.sx + inset, sy: screenBackLeft.sy + inset };
        const chartBaseY = iBR.sy - 4;
        const chartBaseX = iBL.sx + 5;
        return (
          <g>
            <polygon
              points={poly([iTL, iTR, iBR, iBL])}
              fill="currentColor"
              fillOpacity={0.28}
              stroke="currentColor"
              strokeWidth={0.7}
            />
            {/* Browser URL bar top */}
            <line
              x1={iTL.sx + 2}
              y1={iTL.sy + 3}
              x2={iTR.sx - 2}
              y2={iTR.sy + 3}
              stroke="currentColor"
              strokeWidth={0.5}
              opacity={0.55}
            />
            {/* Mock browser tabs */}
            <circle cx={iTL.sx + 3} cy={iTL.sy + 2} r={0.6} fill="currentColor" opacity={0.6} />
            <circle cx={iTL.sx + 5} cy={iTL.sy + 2} r={0.6} fill="currentColor" opacity={0.6} />
            <circle cx={iTL.sx + 7} cy={iTL.sy + 2} r={0.6} fill="currentColor" opacity={0.6} />
            {/* Bars on the screen - the ONE "chart" */}
            {[3, 5, 8, 4, 6].map((h, i) => (
              <rect
                key={i}
                x={chartBaseX + i * 3}
                y={chartBaseY - h}
                width={2}
                height={h}
                fill="currentColor"
                opacity={0.92}
              />
            ))}
            {/* axis line */}
            <line x1={chartBaseX - 1} y1={chartBaseY} x2={chartBaseX + 16} y2={chartBaseY} stroke="currentColor" strokeWidth={0.5} opacity={0.7} />
          </g>
        );
      })()}

      {/* Mug: rim ellipse + sides + body + handle + steam */}
      {(() => {
        const rx = 5;
        const ry = 2;
        return (
          <g>
            {/* body sides */}
            <line x1={mug.sx - rx} y1={mug.sy} x2={mugTop.sx - rx} y2={mugTop.sy} stroke="currentColor" strokeWidth={1.2} />
            <line x1={mug.sx + rx} y1={mug.sy} x2={mugTop.sx + rx} y2={mugTop.sy} stroke="currentColor" strokeWidth={1.2} />
            {/* base arc (bottom half) */}
            <path
              d={`M ${mug.sx - rx} ${mug.sy} A ${rx} ${ry} 0 0 0 ${mug.sx + rx} ${mug.sy}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
            />
            {/* rim full */}
            <Ellipse cx={mugTop.sx} cy={mugTop.sy} rx={rx} ry={ry} fillOpacity={0.14} strokeWidth={1.4} />
            <Ellipse cx={mugTop.sx} cy={mugTop.sy - 0.4} rx={rx * 0.82} ry={ry * 0.8} fillOpacity={0.32} strokeWidth={0.5} />
            {/* handle */}
            <path
              d={`M ${mug.sx + rx - 0.3} ${mug.sy - 2} C ${mug.sx + rx + 7} ${mug.sy - 3}, ${mug.sx + rx + 7} ${mug.sy - 7}, ${mug.sx + rx} ${mug.sy - 9}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
            />
            {/* steam wisps */}
            <path
              d={`M ${mugTop.sx - 2} ${mugTop.sy - 2} q -3 -3 0 -6 q 3 -3 0 -6`}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.6}
              opacity={0.6}
            />
            <path
              d={`M ${mugTop.sx + 1} ${mugTop.sy - 2} q 3 -3 0 -6 q -3 -3 0 -6`}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.6}
              opacity={0.6}
            />
          </g>
        );
      })()}

      {/* Sticky notes cluster (3 stacked) */}
      {(() => {
        const notes: { o: [number, number, number]; squiggle: boolean }[] = [
          { o: [-8, 4, 0], squiggle: false },
          { o: [-4, 8, 0.8], squiggle: false },
          { o: [-6, 2, 1.6], squiggle: true },
        ];
        const s = 9;
        return notes.map((n, i) => {
          const c0 = P(n.o[0], n.o[1], n.o[2]);
          const c1 = P(n.o[0] + s, n.o[1], n.o[2]);
          const c2 = P(n.o[0] + s, n.o[1] + s, n.o[2]);
          const c3 = P(n.o[0], n.o[1] + s, n.o[2]);
          return (
            <g key={i}>
              <polygon
                points={poly([c0, c1, c2, c3])}
                fill="currentColor"
                fillOpacity={0.26 - i * 0.04}
                stroke="currentColor"
                strokeWidth={1.1}
                strokeLinejoin="round"
              />
              {/* dog-ear */}
              <path
                d={`M ${c2.sx - 3} ${c2.sy - 0.5} l 3 0.5 l -0.5 -3 z`}
                fill="currentColor"
                fillOpacity={0.4}
                stroke="currentColor"
                strokeWidth={0.6}
              />
              {n.squiggle && (
                <g stroke="currentColor" strokeWidth={0.5} fill="none" opacity={0.8}>
                  <path d={`M ${c0.sx + 2} ${c0.sy + 4} q 2 -1 4 0 q 2 1 4 0`} />
                  <line x1={c0.sx + 2} y1={c0.sy + 7} x2={c0.sx + 10} y2={c0.sy + 7} />
                  <line x1={c0.sx + 2} y1={c0.sy + 9} x2={c0.sx + 7} y2={c0.sy + 9} />
                </g>
              )}
            </g>
          );
        });
      })()}

      {/* Pen (angled across desk) */}
      <g strokeLinecap="round">
        <line x1={penA.sx} y1={penA.sy} x2={penB.sx} y2={penB.sy} stroke="currentColor" strokeWidth={1.8} />
        {/* cap ring */}
        <line x1={penA.sx - 1.2} y1={penA.sy + 0.4} x2={penA.sx + 2.4} y2={penA.sy - 1.2} stroke="currentColor" strokeWidth={2.2} opacity={0.85} />
        {/* pen tip */}
        <circle cx={penB.sx} cy={penB.sy} r={1.0} fill="currentColor" />
      </g>

      {/* Headphones */}
      {(() => {
        return (
          <g>
            <Ellipse cx={phones.sx - 5} cy={phones.sy} rx={3.2} ry={2.2} fillOpacity={0.2} strokeWidth={1.2} />
            <Ellipse cx={phones.sx + 5} cy={phones.sy} rx={3.2} ry={2.2} fillOpacity={0.2} strokeWidth={1.2} />
            <path
              d={`M ${phones.sx - 5} ${phones.sy - 2.2} q 5 -5 10 0`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.3}
            />
            <circle cx={phones.sx - 5} cy={phones.sy + 0.4} r={1.0} fill="currentColor" opacity={0.7} />
            <circle cx={phones.sx + 5} cy={phones.sy + 0.4} r={1.0} fill="currentColor" opacity={0.7} />
          </g>
        );
      })()}

      {/* Paper wad */}
      {(() => {
        const pts = [
          { sx: wad.sx - 4, sy: wad.sy },
          { sx: wad.sx - 2, sy: wad.sy - 4 },
          { sx: wad.sx + 2, sy: wad.sy - 4.4 },
          { sx: wad.sx + 4.6, sy: wad.sy - 0.8 },
          { sx: wad.sx + 3, sy: wad.sy + 3 },
          { sx: wad.sx - 2.5, sy: wad.sy + 2.4 },
        ];
        return (
          <g>
            <polygon
              points={poly(pts)}
              fill="currentColor"
              fillOpacity={0.22}
              stroke="currentColor"
              strokeWidth={1.0}
              strokeLinejoin="round"
            />
            <path d={`M ${wad.sx - 1.5} ${wad.sy - 1.5} l 2 1.2 l -1 1.4`} fill="none" stroke="currentColor" strokeWidth={0.5} opacity={0.7} />
            <path d={`M ${wad.sx + 0.5} ${wad.sy + 0.5} l 1.4 1 l -0.6 1`} fill="none" stroke="currentColor" strokeWidth={0.5} opacity={0.6} />
          </g>
        );
      })()}

      {/* Books stack (2) */}
      <ScaledIsoCube
        origin={book1O}
        size={[14, 10, 3.5]}
        face={{ top: 0.3, left: 0.18, right: 0.1 }}
        strokeWidth={1.2}
      />
      <ScaledIsoCube
        origin={[book1O[0] + 1, book1O[1] + 1, book1O[2] + 3.5]}
        size={[12.5, 9, 3]}
        face={{ top: 0.24, left: 0.14, right: 0.08 }}
        strokeWidth={1.1}
      />

      {/* Lamp */}
      {(() => {
        const cone = [
          { sx: lampArm2.sx - 6, sy: lampArm2.sy + 4 },
          { sx: lampArm2.sx + 6, sy: lampArm2.sy + 4 },
          { sx: lampArm2.sx + 3, sy: lampArm2.sy - 2 },
          { sx: lampArm2.sx - 3, sy: lampArm2.sy - 2 },
        ];
        return (
          <g>
            <Ellipse cx={lampBase.sx} cy={lampBase.sy} rx={4} ry={1.8} fillOpacity={0.28} strokeWidth={1.2} />
            <line x1={lampBase.sx} y1={lampBase.sy - 1.2} x2={lampArm1.sx} y2={lampArm1.sy} stroke="currentColor" strokeWidth={1.4} />
            <line x1={lampArm1.sx} y1={lampArm1.sy} x2={lampArm2.sx} y2={lampArm2.sy} stroke="currentColor" strokeWidth={1.4} />
            <polygon
              points={poly(cone)}
              fill="currentColor"
              fillOpacity={0.3}
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {/* beams */}
            {[-3, 0, 3].map((dx, i) => (
              <line
                key={i}
                x1={lampArm2.sx + dx * 1.2}
                y1={lampArm2.sy + 4}
                x2={lampArm2.sx + dx * 2.4}
                y2={lampArm2.sy + 16}
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.45}
                strokeDasharray="2 2"
              />
            ))}
          </g>
        );
      })()}

      {/* CSV icon — THE punchline. Give it a cream halo so the joke reads. */}
      {(() => {
        return (
          <g>
            {/* halo — dashed box around CSV to signal "this matters" */}
            <rect
              x={csvTL.sx - 3}
              y={csvTL.sy - 3}
              width={csvTR.sx - csvTL.sx + 6}
              height={csvBL.sy - csvTL.sy + 6}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.6}
              strokeDasharray="2 2"
              opacity={0.5}
            />
            <polygon
              points={poly([csvTL, csvTR, csvBR, csvBL])}
              fill="currentColor"
              fillOpacity={0.5}
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
            {/* corner fold */}
            <polygon
              points={poly([
                { sx: csvTR.sx - 4, sy: csvTR.sy },
                { sx: csvTR.sx, sy: csvTR.sy + 4 },
                { sx: csvTR.sx - 4, sy: csvTR.sy + 4 },
              ])}
              fill="currentColor"
              fillOpacity={0.85}
              stroke="currentColor"
              strokeWidth={1.0}
            />
            {/* 4 ascending bars — mini chart */}
            {[2, 3.5, 5, 3].map((bh, i) => (
              <rect
                key={i}
                x={csvTL.sx + 2 + i * 2}
                y={csvBL.sy - 2 - bh}
                width={1.4}
                height={bh}
                fill="currentColor"
                opacity={0.98}
              />
            ))}
            <text
              x={csvTL.sx + 1.5}
              y={csvTL.sy + 3}
              fontFamily="ui-monospace, monospace"
              fontSize={2.8}
              letterSpacing="0.4"
              fontWeight={600}
              fill="currentColor"
              opacity={0.98}
            >
              CSV
            </text>
          </g>
        );
      })()}

      {/* THE leader — CSV → bottom-right corner. Terminate ABOVE the label line. */}
      <ConstructionLine
        from={[csvCenter.sx + 2, csvCenter.sy + 4]}
        to={[192, 258]}
        tick="start"
        strokeWidth={1.0}
        dashPattern="4 3"
        opacity={0.9}
      />
      {/* arrow head at corner */}
      <polygon
        points={`192,258 188,254 188,262`}
        fill="currentColor"
        opacity={0.9}
      />
    </SceneFrame>
  );
};
