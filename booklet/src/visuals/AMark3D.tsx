import React from "react";
import { COLORS } from "../theme";

/**
 * Static 3D isometric "A" mark — extracted from the video's
 * `AnimatedLogoMark` (3D variant) at its pre-rotation, pre-morph state.
 * Three prismatic blocks (left leg, crossbar, right leg) render with three
 * face-opacities each (right 0.06 · top 0.16 · front 0.10), a floor grid
 * plane, and a circular apex. No animation — pure SVG for print.
 *
 * The original video renders into a 32×32 viewBox with ISO_SCALE = 0.161.
 * We preserve that math exactly so the geometry matches frame-0 of the
 * video's intro; callers choose the display `width`/`height`.
 */

export type AMark3DProps = {
  width?: number;
  height?: number;
  color?: string;
  /** Toggle the faint ground-plane grid behind the mark. Default true. */
  floor?: boolean;
};

const ISO_SCALE = 0.161;

// Strict isometric projection (no rotation, no morph — static frame 0).
const project = (x: number, y: number, z: number): [number, number] => {
  const sx = 16 + (x - y) * 0.866025 * ISO_SCALE;
  const sy = 16 + (x + y) * 0.5 * ISO_SCALE - z * ISO_SCALE;
  return [sx, sy];
};

// Draw one prismatic leg: right face, top face, front face. All three coplanar
// with the y-axis so the prism has thickness y1..y2.
const Block: React.FC<{
  bl: [number, number];
  br: [number, number];
  tr: [number, number];
  tl: [number, number];
  y1: number;
  y2: number;
  stroke: string;
}> = ({ bl, br, tr, tl, y1, y2, stroke }) => {
  const rightFace = [
    project(br[0], y2, br[1]),
    project(tr[0], y2, tr[1]),
    project(tr[0], y1, tr[1]),
    project(br[0], y1, br[1]),
  ];
  const topFace = [
    project(tl[0], y2, tl[1]),
    project(tr[0], y2, tr[1]),
    project(tr[0], y1, tr[1]),
    project(tl[0], y1, tl[1]),
  ];
  const frontFace = [
    project(bl[0], y2, bl[1]),
    project(br[0], y2, br[1]),
    project(tr[0], y2, tr[1]),
    project(tl[0], y2, tl[1]),
  ];
  const toPts = (pts: [number, number][]) =>
    pts.map((p) => p.join(",")).join(" ");
  return (
    <g
      stroke={stroke}
      strokeOpacity={0.55}
      strokeWidth={0.32}
      strokeLinejoin="round"
    >
      <polygon points={toPts(rightFace)} fill={stroke} fillOpacity={0.10} />
      <polygon points={toPts(topFace)}   fill={stroke} fillOpacity={0.22} />
      <polygon points={toPts(frontFace)} fill={stroke} fillOpacity={0.15} />
    </g>
  );
};

export const AMark3D: React.FC<AMark3DProps> = ({
  width = 220,
  height = 220,
  color = COLORS.INK,
  floor = true,
}) => {
  // Leg block coordinates — identical to the video's 3D variant.
  const leftLeg = {
    bl: [-45, 0] as [number, number],
    br: [-25, 0] as [number, number],
    tr: [-2, 80] as [number, number],
    tl: [-22, 80] as [number, number],
    y1: -8,
    y2: 8,
  };
  const cross = {
    bl: [-15, 35] as [number, number],
    br: [15, 35] as [number, number],
    tr: [11, 50] as [number, number],
    tl: [-11, 50] as [number, number],
    y1: -8,
    y2: 8,
  };
  const rightLeg = {
    bl: [25, 0] as [number, number],
    br: [45, 0] as [number, number],
    tr: [22, 80] as [number, number],
    tl: [2, 80] as [number, number],
    y1: -8,
    y2: 8,
  };

  // Floor rhombus + three grid lines each direction.
  const floorCorners = (
    [
      [-80, -80, -20],
      [80, -80, -20],
      [80, 80, -20],
      [-80, 80, -20],
    ] as const
  ).map(([x, y, z]) => project(x, y, z));

  // Apex circle sits at (0, 0, 92) pre-morph.
  const [ax, ay] = project(0, 0, 92);

  // Subtle connective "spine" lines that read in the video as tracers —
  // kept here as static strokes so the mark has explicit edges.
  const [leftSpineA, leftSpineB]   = [project(-35, 0, 0), project(-12, 0, 80)];
  const [crossSpineA, crossSpineB] = [project(-13, 0, 42.5), project(13, 0, 42.5)];
  const [rightSpineA, rightSpineB] = [project(35, 0, 0), project(12, 0, 80)];

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible", display: "block" }}
      aria-hidden="true"
    >
      {floor && (
        <g>
          <polygon
            points={floorCorners.map((p) => p.join(",")).join(" ")}
            fill={color}
            fillOpacity={0.012}
            stroke={color}
            strokeOpacity={0.15}
            strokeWidth={0.2}
          />
          {[-40, 0, 40].map((v) => {
            const a = project(v, -80, -20);
            const b = project(v, 80, -20);
            const c = project(-80, v, -20);
            const d = project(80, v, -20);
            return (
              <React.Fragment key={v}>
                <line
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={color}
                  strokeOpacity={0.07}
                  strokeWidth={0.2}
                />
                <line
                  x1={c[0]}
                  y1={c[1]}
                  x2={d[0]}
                  y2={d[1]}
                  stroke={color}
                  strokeOpacity={0.07}
                  strokeWidth={0.2}
                />
              </React.Fragment>
            );
          })}
        </g>
      )}

      <Block {...leftLeg} stroke={color} />
      <line
        x1={leftSpineA[0]}
        y1={leftSpineA[1]}
        x2={leftSpineB[0]}
        y2={leftSpineB[1]}
        stroke={color}
        strokeWidth={0.35}
        strokeOpacity={0.55}
        strokeLinecap="round"
      />

      <Block {...cross} stroke={color} />
      <line
        x1={crossSpineA[0]}
        y1={crossSpineA[1]}
        x2={crossSpineB[0]}
        y2={crossSpineB[1]}
        stroke={color}
        strokeWidth={0.35}
        strokeOpacity={0.55}
        strokeLinecap="round"
      />

      <Block {...rightLeg} stroke={color} />
      <line
        x1={rightSpineA[0]}
        y1={rightSpineA[1]}
        x2={rightSpineB[0]}
        y2={rightSpineB[1]}
        stroke={color}
        strokeWidth={0.35}
        strokeOpacity={0.22}
        strokeLinecap="round"
      />

      {/* Apex — solid inner disk only. The video uses a ring+halo but in
          print that reads as a bullseye; a single dot is cleaner. */}
      <circle cx={ax} cy={ay} r={0.55} fill={color} />
    </svg>
  );
};
