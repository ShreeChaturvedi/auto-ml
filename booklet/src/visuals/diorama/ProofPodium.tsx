import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, iso } from "./primitives";

/**
 * PROOF — Olympic 3-tier podium. Tier 1 (center, tallest) highlighted with
 * star, ribbon, and laurels. Tiers 2 (silver, left) and 3 (bronze, right).
 * Model cards atop each tier. Two dashed spotlight cones. Three concentric
 * contour rings on the ground (echoes cover benchmark peak).
 *
 * Success green ground, cream linework.
 */

const LINE = COLORS.PAPER_WARM;

const SCALE = 1.7;
const OFFSET_X = 108;
const OFFSET_Y = 168;
const P = (x: number, y: number, z = 0) => {
  const p = iso(x, y, z);
  return { sx: p.sx * SCALE + OFFSET_X, sy: p.sy * SCALE + OFFSET_Y };
};

const poly = (pts: { sx: number; sy: number }[]) =>
  pts.map((p) => `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`).join(" ");

// Scaled IsoCube
const SCube: React.FC<{
  origin: [number, number, number];
  size: [number, number, number];
  face?: { top: number; left: number; right: number };
  strokeWidth?: number;
  dashed?: boolean;
}> = ({ origin: [ox, oy, oz], size: [w, d, h], face = { top: 0.22, left: 0.14, right: 0.08 }, strokeWidth = 1.2, dashed = false }) => {
  const p000 = P(ox, oy, oz);
  const p100 = P(ox + w, oy, oz);
  const p010 = P(ox, oy + d, oz);
  const p110 = P(ox + w, oy + d, oz);
  const p001 = P(ox, oy, oz + h);
  const p101 = P(ox + w, oy, oz + h);
  const p011 = P(ox, oy + d, oz + h);
  const p111 = P(ox + w, oy + d, oz + h);
  const common = dashed ? { strokeDasharray: "3 3" } : {};
  return (
    <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" {...common}>
      <polygon points={poly([p001, p101, p111, p011])} fill="currentColor" fillOpacity={face.top} />
      <polygon points={poly([p000, p001, p011, p010])} fill="currentColor" fillOpacity={face.left} />
      <polygon points={poly([p100, p101, p111, p110])} fill="currentColor" fillOpacity={face.right} />
    </g>
  );
};

export const ProofPodium: React.FC = () => {
  // Podium tiers — layout so tier 1 (center, front-facing) doesn't overlap 2/3
  // back-left (2, taller), back-right (3, shortest), front-center (1, tallest)
  const T2 = { o: [-28, -16, 0] as [number, number, number], w: 16, d: 12, h: 14 };
  const T3 = { o: [12, -16, 0] as [number, number, number], w: 16, d: 12, h: 9 };
  const T1 = { o: [-8, -2, 0] as [number, number, number], w: 16, d: 12, h: 22 };

  // Ground plane
  const ground = { o: [-50, -35, 0] as [number, number, number], w: 100, d: 70 };
  const gc = {
    tl: P(ground.o[0], ground.o[1], 0),
    tr: P(ground.o[0] + ground.w, ground.o[1], 0),
    br: P(ground.o[0] + ground.w, ground.o[1] + ground.d, 0),
    bl: P(ground.o[0], ground.o[1] + ground.d, 0),
  };

  // Spotlight source (off-canvas top)
  const coneLeftTip = { sx: 36, sy: 2 };
  const coneRightTip = { sx: 180, sy: 8 };

  // Tier 1 top center for star/cards
  const t1TopCenter = P(T1.o[0] + T1.w / 2, T1.o[1] + T1.d / 2, T1.o[2] + T1.h);

  return (
    <SceneFrame
      lineColor={LINE}
      cornerLabels={{ topLeft: "§04 · PROOF", bottomRight: "TIER 1 · 24.9 R²" }}
    >
      {/* Spotlight cones (dashed) */}
      <polygon
        points={poly([
          coneLeftTip,
          { sx: t1TopCenter.sx - 14, sy: t1TopCenter.sy + 2 },
          { sx: t1TopCenter.sx + 2, sy: t1TopCenter.sy - 4 },
        ])}
        fill="currentColor"
        fillOpacity={0.06}
        stroke="currentColor"
        strokeWidth={0.6}
        strokeDasharray="2 2"
        opacity={0.5}
      />
      <polygon
        points={poly([
          coneRightTip,
          { sx: t1TopCenter.sx + 2, sy: t1TopCenter.sy - 4 },
          { sx: t1TopCenter.sx + 14, sy: t1TopCenter.sy + 4 },
        ])}
        fill="currentColor"
        fillOpacity={0.06}
        stroke="currentColor"
        strokeWidth={0.6}
        strokeDasharray="2 2"
        opacity={0.5}
      />

      {/* Ground plane */}
      <polygon
        points={poly([gc.tl, gc.tr, gc.br, gc.bl])}
        fill="currentColor"
        fillOpacity={0.04}
        stroke="currentColor"
        strokeWidth={0.5}
        strokeOpacity={0.3}
        strokeLinejoin="round"
      />

      {/* Contour rings — echo of benchmark peak */}
      {(() => {
        const c = P(0, 0, 0);
        return (
          <g>
            {[40, 26, 14].map((r, i) => (
              <ellipse
                key={i}
                cx={c.sx}
                cy={c.sy + 4}
                rx={r}
                ry={r * 0.55}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.5}
                strokeDasharray="1 2"
                opacity={0.32 + i * 0.15}
              />
            ))}
          </g>
        );
      })()}

      {/* Podium shadow */}
      {(() => {
        const sh = [
          { sx: P(T2.o[0] - 4, T2.o[1] + T2.d + 4, 0).sx, sy: P(T2.o[0] - 4, T2.o[1] + T2.d + 4, 0).sy },
          { sx: P(T1.o[0] + T1.w + 4, T1.o[1] + T1.d + 4, 0).sx, sy: P(T1.o[0] + T1.w + 4, T1.o[1] + T1.d + 4, 0).sy },
          { sx: P(T3.o[0] + T3.w + 4, T3.o[1] - 4, 0).sx, sy: P(T3.o[0] + T3.w + 4, T3.o[1] - 4, 0).sy },
          { sx: P(T2.o[0] - 4, T2.o[1] - 4, 0).sx, sy: P(T2.o[0] - 4, T2.o[1] - 4, 0).sy },
        ];
        return <polygon points={poly(sh)} fill="currentColor" fillOpacity={0.08} />;
      })()}

      {/* Back tiers first (2, 3), then front (1) so z-order reads */}
      <SCube
        origin={T2.o}
        size={[T2.w, T2.d, T2.h]}
        face={{ top: 0.22, left: 0.14, right: 0.08 }}
        strokeWidth={1.2}
      />
      <SCube
        origin={T3.o}
        size={[T3.w, T3.d, T3.h]}
        face={{ top: 0.18, left: 0.12, right: 0.07 }}
        strokeWidth={1.2}
      />
      {/* Tier 1 — drawn AFTER so it sits in front of the others */}
      <SCube
        origin={T1.o}
        size={[T1.w, T1.d, T1.h]}
        face={{ top: 0.34, left: 0.22, right: 0.13 }}
        strokeWidth={1.6}
      />

      {/* Lectern seam on tier 1 — horizontal at 70% height */}
      {(() => {
        const seamZ = T1.o[2] + T1.h * 0.7;
        const a = P(T1.o[0], T1.o[1] + T1.d, seamZ);
        const b = P(T1.o[0] + T1.w, T1.o[1] + T1.d, seamZ);
        const c = P(T1.o[0] + T1.w, T1.o[1], seamZ);
        return (
          <g stroke="currentColor" strokeWidth={0.6} opacity={0.65}>
            <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} />
            <line x1={b.sx} y1={b.sy} x2={c.sx} y2={c.sy} />
          </g>
        );
      })()}

      {/* Front-face numbers — positioned slightly below center of each front face */}
      {(() => {
        const n1 = P(T1.o[0] + T1.w / 2, T1.o[1] + T1.d + 0.3, T1.o[2] + T1.h * 0.32);
        const n2 = P(T2.o[0] + T2.w / 2, T2.o[1] + T2.d + 0.3, T2.o[2] + T2.h * 0.4);
        const n3 = P(T3.o[0] + T3.w / 2, T3.o[1] + T3.d + 0.3, T3.o[2] + T3.h * 0.4);
        return (
          <g>
            <text
              x={n1.sx}
              y={n1.sy}
              textAnchor="middle"
              fontFamily="Instrument Serif, serif"
              fontStyle="italic"
              fontSize={24}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth={0.3}
              opacity={1}
            >
              1
            </text>
            <text
              x={n2.sx}
              y={n2.sy}
              textAnchor="middle"
              fontFamily="Instrument Serif, serif"
              fontStyle="italic"
              fontSize={18}
              fill="currentColor"
              opacity={0.85}
            >
              2
            </text>
            <text
              x={n3.sx}
              y={n3.sy}
              textAnchor="middle"
              fontFamily="Instrument Serif, serif"
              fontStyle="italic"
              fontSize={14}
              fill="currentColor"
              opacity={0.75}
            >
              3
            </text>
          </g>
        );
      })()}

      {/* Model cards atop each tier */}
      {(() => {
        const makeCard = (tier: { o: [number, number, number]; w: number; d: number; h: number }, cw: number, cd: number) => {
          const cx = tier.o[0] + tier.w / 2;
          const cy = tier.o[1] + tier.d / 2;
          const z = tier.o[2] + tier.h + 0.1;
          return {
            a: P(cx - cw / 2, cy - cd / 2, z),
            b: P(cx + cw / 2, cy - cd / 2, z),
            c: P(cx + cw / 2, cy + cd / 2, z),
            d: P(cx - cw / 2, cy + cd / 2, z),
          };
        };

        const draw = (c: ReturnType<typeof makeCard>, title: string, lines: number, active = false) => (
          <g>
            <polygon
              points={poly([c.a, c.b, c.c, c.d])}
              fill="currentColor"
              fillOpacity={active ? 0.3 : 0.16}
              stroke="currentColor"
              strokeWidth={active ? 1.6 : 1.0}
              strokeLinejoin="round"
            />
            <text
              x={(c.a.sx + c.b.sx) / 2}
              y={c.a.sy + 3}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
              fontSize={3.4}
              letterSpacing="0.8"
              fontWeight={600}
              fill="currentColor"
              opacity={0.98}
            >
              {title}
            </text>
            {Array.from({ length: lines }).map((_, i) => (
              <line
                key={i}
                x1={c.a.sx + 2}
                y1={c.a.sy + 5.5 + i * 1.6}
                x2={c.b.sx - 2 - i * 1.2}
                y2={c.a.sy + 5.5 + i * 1.6}
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.8}
              />
            ))}
          </g>
        );

        const card2 = makeCard(T2, 14, 10);
        const card3 = makeCard(T3, 14, 10);
        const card1 = makeCard(T1, 16, 11);

        return (
          <g>
            {draw(card2, "MODEL·B", 2)}
            {draw(card3, "MODEL·C", 2)}
            {draw(card1, "MODEL·A", 3, true)}
          </g>
        );
      })()}

      {/* Star above card 1 */}
      {(() => {
        const c = { sx: t1TopCenter.sx, sy: t1TopCenter.sy - 14 };
        const pts: string[] = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 === 0 ? 5 : 2;
          pts.push(`${(c.sx + Math.cos(a) * r).toFixed(2)},${(c.sy + Math.sin(a) * r).toFixed(2)}`);
        }
        return <polygon points={pts.join(" ")} fill="currentColor" fillOpacity={0.75} stroke="currentColor" strokeWidth={0.9} />;
      })()}

      {/* Laurel arcs left + right of star */}
      {(() => {
        const c = { sx: t1TopCenter.sx, sy: t1TopCenter.sy - 14 };
        const leafL = (t: number) => ({ x: c.sx - 7 - t * 4, y: c.sy + 2 - t * 3 });
        const leafR = (t: number) => ({ x: c.sx + 7 + t * 4, y: c.sy + 2 - t * 3 });
        return (
          <g>
            <path
              d={`M ${c.sx - 6} ${c.sy + 3} Q ${c.sx - 14} ${c.sy - 4} ${c.sx - 14} ${c.sy - 10}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.9}
              opacity={0.85}
            />
            <path
              d={`M ${c.sx + 6} ${c.sy + 3} Q ${c.sx + 14} ${c.sy - 4} ${c.sx + 14} ${c.sy - 10}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.9}
              opacity={0.85}
            />
            {[0, 1, 2].map((i) => {
              const l = leafL(i / 2);
              const r = leafR(i / 2);
              return (
                <g key={i}>
                  <ellipse cx={l.x} cy={l.y} rx={1.6} ry={0.8} transform={`rotate(${-40 + i * -15} ${l.x} ${l.y})`} fill="currentColor" fillOpacity={0.6} stroke="currentColor" strokeWidth={0.4} />
                  <ellipse cx={r.x} cy={r.y} rx={1.6} ry={0.8} transform={`rotate(${40 + i * 15} ${r.x} ${r.y})`} fill="currentColor" fillOpacity={0.6} stroke="currentColor" strokeWidth={0.4} />
                </g>
              );
            })}
          </g>
        );
      })()}

      {/* Ribbon trailing off tier 1 to the right */}
      {(() => {
        const start = P(T1.o[0] + T1.w, T1.o[1] + T1.d / 2, T1.o[2] + T1.h * 0.5);
        return (
          <g>
            <path
              d={`M ${start.sx} ${start.sy} q 12 -3 20 4 q 4 3 -2 6 q -8 3 -18 -4 z`}
              fill="currentColor"
              fillOpacity={0.55}
              stroke="currentColor"
              strokeWidth={0.9}
              strokeLinejoin="round"
            />
            <path
              d={`M ${start.sx + 5} ${start.sy + 1} q 5 0 10 3`}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.5}
              opacity={0.8}
            />
            {/* forked tail */}
            <path
              d={`M ${start.sx + 18} ${start.sy + 6} l 4 3 l -3 -1 l 3 4 l -5 -2 z`}
              fill="currentColor"
              fillOpacity={0.6}
              stroke="currentColor"
              strokeWidth={0.5}
            />
          </g>
        );
      })()}

      {/* Confetti */}
      {[
        { x: 28, y: 50, r: 1.0 },
        { x: 52, y: 32, r: 1.3 },
        { x: 84, y: 24, r: 0.8 },
        { x: 114, y: 18, r: 1.4 },
        { x: 148, y: 30, r: 0.9 },
        { x: 180, y: 48, r: 1.1 },
        { x: 194, y: 78, r: 0.8 },
        { x: 30, y: 100, r: 1.0 },
      ].map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="currentColor" opacity={0.7} />
      ))}

      {/* Medal badges on tiers 2, 3 */}
      {(() => {
        const m2 = P(T2.o[0] + T2.w / 2, T2.o[1] + T2.d, T2.o[2] + T2.h * 0.22);
        const m3 = P(T3.o[0] + T3.w / 2, T3.o[1] + T3.d, T3.o[2] + T3.h * 0.25);
        return (
          <g>
            <circle cx={m2.sx} cy={m2.sy} r={3.2} fill="currentColor" fillOpacity={0.45} stroke="currentColor" strokeWidth={0.7} />
            <text x={m2.sx} y={m2.sy + 1.4} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={3} fontWeight={600} fill="currentColor">
              B
            </text>
            <circle cx={m3.sx} cy={m3.sy} r={2.8} fill="currentColor" fillOpacity={0.35} stroke="currentColor" strokeWidth={0.6} />
            <text x={m3.sx} y={m3.sy + 1.2} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={2.8} fontWeight={600} fill="currentColor">
              C
            </text>
          </g>
        );
      })()}
    </SceneFrame>
  );
};
