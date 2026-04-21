import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, FlowChannel, Marker, iso } from "./primitives";

/**
 * HOW — three floating isometric planes in a descending staircase:
 * Chat (top-left) → Plan (middle, active) → Notebook (bottom-right). Two
 * arcing flow channels connect them with frozen tracer beats.
 *
 * Accent-blue ground, cream linework.
 */

const LINE = COLORS.PAPER_WARM;

const SCALE = 1.6;
const OFFSET_X = 108;
const OFFSET_Y = 148;
const P = (x: number, y: number, z = 0) => {
  const p = iso(x, y, z);
  return { sx: p.sx * SCALE + OFFSET_X, sy: p.sy * SCALE + OFFSET_Y };
};

const poly = (pts: { sx: number; sy: number }[]) =>
  pts.map((p) => `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`).join(" ");

// Scaled iso plane with optional grid
const ScaledPlane: React.FC<{
  origin: [number, number, number];
  size: [number, number];
  fillOpacity?: number;
  strokeOpacity?: number;
  strokeWidth?: number;
  grid?: { rows: number; cols: number };
  dashedBorder?: boolean;
}> = ({ origin: [ox, oy, oz], size: [w, d], fillOpacity = 0.05, strokeOpacity = 0.6, strokeWidth = 1.0, grid, dashedBorder = false }) => {
  const p00 = P(ox, oy, oz);
  const p10 = P(ox + w, oy, oz);
  const p11 = P(ox + w, oy + d, oz);
  const p01 = P(ox, oy + d, oz);

  const gridLines: React.ReactElement[] = [];
  if (grid) {
    for (let i = 1; i < grid.cols; i++) {
      const t = i / grid.cols;
      const a = P(ox + w * t, oy, oz);
      const b = P(ox + w * t, oy + d, oz);
      gridLines.push(<line key={`c${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="currentColor" strokeWidth={0.5} strokeOpacity={strokeOpacity * 0.45} />);
    }
    for (let j = 1; j < grid.rows; j++) {
      const t = j / grid.rows;
      const a = P(ox, oy + d * t, oz);
      const b = P(ox + w, oy + d * t, oz);
      gridLines.push(<line key={`r${j}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="currentColor" strokeWidth={0.5} strokeOpacity={strokeOpacity * 0.45} />);
    }
  }

  return (
    <g>
      <polygon
        points={poly([p00, p10, p11, p01])}
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

export const HowTriptych: React.FC = () => {
  // Three planes at descending z heights
  const chat = { o: [-50, -30, 18] as [number, number, number], w: 38, d: 24 };
  const plan = { o: [-16, -8, 4] as [number, number, number], w: 44, d: 28 };
  const notebook = { o: [18, 14, -8] as [number, number, number], w: 38, d: 24 };

  // Flow endpoints (in projected coords)
  const chatOutPt = P(chat.o[0] + chat.w * 0.75, chat.o[1] + chat.d, chat.o[2]);
  const planInPt = P(plan.o[0] + 4, plan.o[1] + 2, plan.o[2]);
  const planOutPt = P(plan.o[0] + plan.w - 4, plan.o[1] + plan.d - 4, plan.o[2]);
  const notebookInPt = P(notebook.o[0] + 4, notebook.o[1] + 4, notebook.o[2]);

  return (
    <SceneFrame
      lineColor={LINE}
      cornerLabels={{ topLeft: "§02 · HOW", bottomRight: "CHAT → PLAN → RUN" }}
    >
      {/* --- CHAT plane --------------------------------------------- */}
      <ScaledPlane
        origin={chat.o}
        size={[chat.w, chat.d]}
        fillOpacity={0.1}
        strokeOpacity={0.85}
        strokeWidth={1.2}
      />
      {/* Chat label — above plane, left-aligned */}
      {(() => {
        const p = P(chat.o[0] + 2, chat.o[1] - 3, chat.o[2]);
        return (
          <text
            x={p.sx}
            y={p.sy}
            fontFamily="ui-monospace, monospace"
            fontSize={4.4}
            letterSpacing="1"
            fontWeight={600}
            fill="currentColor"
            opacity={0.8}
          >
            CHAT · USER
          </text>
        );
      })()}
      {/* Big chat bubble on CHAT plane */}
      {(() => {
        const a = P(chat.o[0] + 3, chat.o[1] + 3, chat.o[2]);
        const b = P(chat.o[0] + 22, chat.o[1] + 3, chat.o[2]);
        const c = P(chat.o[0] + 22, chat.o[1] + 12, chat.o[2]);
        const tailBack = P(chat.o[0] + 10, chat.o[1] + 12, chat.o[2]);
        const tailTip = P(chat.o[0] + 8, chat.o[1] + 17, chat.o[2]);
        const tailEdge = P(chat.o[0] + 6, chat.o[1] + 12, chat.o[2]);
        return (
          <g>
            <polygon
              points={poly([a, b, c, tailBack, tailTip, tailEdge])}
              fill="currentColor"
              fillOpacity={0.3}
              stroke="currentColor"
              strokeWidth={1.3}
              strokeLinejoin="round"
            />
            {/* text lines */}
            {[0, 1, 2].map((i) => {
              const la = P(chat.o[0] + 5, chat.o[1] + 5 + i * 2.5, chat.o[2]);
              const lb = P(chat.o[0] + 20 - i * 2, chat.o[1] + 5 + i * 2.5, chat.o[2]);
              return (
                <line
                  key={i}
                  x1={la.sx}
                  y1={la.sy}
                  x2={lb.sx}
                  y2={lb.sy}
                  stroke="currentColor"
                  strokeWidth={0.8}
                  opacity={0.9}
                />
              );
            })}
          </g>
        );
      })()}
      {/* Chat reply bubble */}
      {(() => {
        const a = P(chat.o[0] + 16, chat.o[1] + 15, chat.o[2]);
        const b = P(chat.o[0] + 34, chat.o[1] + 15, chat.o[2]);
        const c = P(chat.o[0] + 34, chat.o[1] + 22, chat.o[2]);
        const d = P(chat.o[0] + 16, chat.o[1] + 22, chat.o[2]);
        return (
          <g>
            <polygon
              points={poly([a, b, c, d])}
              fill="currentColor"
              fillOpacity={0.15}
              stroke="currentColor"
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
            {[0, 1].map((i) => {
              const la = P(chat.o[0] + 17.5, chat.o[1] + 17 + i * 2, chat.o[2]);
              const lb = P(chat.o[0] + 33 - i, chat.o[1] + 17 + i * 2, chat.o[2]);
              return <line key={i} x1={la.sx} y1={la.sy} x2={lb.sx} y2={lb.sy} stroke="currentColor" strokeWidth={0.7} opacity={0.85} />;
            })}
          </g>
        );
      })()}

      {/* --- PLAN plane (active) ----------------------------------- */}
      <ScaledPlane
        origin={plan.o}
        size={[plan.w, plan.d]}
        fillOpacity={0.16}
        strokeOpacity={0.95}
        strokeWidth={1.4}
        grid={{ rows: 4, cols: 6 }}
      />
      {/* active halo */}
      <ScaledPlane
        origin={[plan.o[0] - 3, plan.o[1] - 3, plan.o[2]]}
        size={[plan.w + 6, plan.d + 6]}
        fillOpacity={0}
        strokeOpacity={0.4}
        strokeWidth={0.6}
        dashedBorder
      />
      {/* Plan label — on right side of plane so it doesn't collide with flow */}
      {(() => {
        const p = P(plan.o[0] + plan.w - 20, plan.o[1] - 2, plan.o[2]);
        return (
          <text
            x={p.sx}
            y={p.sy}
            fontFamily="ui-monospace, monospace"
            fontSize={4.4}
            letterSpacing="1"
            fontWeight={600}
            fill="currentColor"
            opacity={0.95}
          >
            PLAN · 03/04
          </text>
        );
      })()}
      {/* Step chips — 4 horizontal chips */}
      {(() => {
        const chipY = plan.o[1] + 10;
        const chipH = 5;
        const chipW = 8;
        const gap = 1.5;
        const steps = [
          { done: true, active: false },
          { done: true, active: false },
          { done: false, active: true },
          { done: false, active: false },
        ];
        return (
          <g>
            {steps.map((s, i) => {
              const x0 = plan.o[0] + 3 + i * (chipW + gap);
              const a = P(x0, chipY, plan.o[2]);
              const b = P(x0 + chipW, chipY, plan.o[2]);
              const c = P(x0 + chipW, chipY + chipH, plan.o[2]);
              const d = P(x0, chipY + chipH, plan.o[2]);
              const fill = s.active ? 0.5 : s.done ? 0.22 : 0.08;
              const sw = s.active ? 1.6 : 1.0;
              return (
                <g key={i}>
                  <polygon
                    points={poly([a, b, c, d])}
                    fill="currentColor"
                    fillOpacity={fill}
                    stroke="currentColor"
                    strokeWidth={sw}
                    strokeLinejoin="round"
                  />
                  {s.done && (
                    <path
                      d={`M ${a.sx + 2} ${a.sy + 3.2} l 1.6 1.6 l 3.4 -3`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {s.active && (
                    <g>
                      <circle cx={(a.sx + c.sx) / 2} cy={(a.sy + c.sy) / 2} r={1.4} fill="currentColor" />
                      <circle cx={(a.sx + c.sx) / 2} cy={(a.sy + c.sy) / 2} r={2.4} fill="none" stroke="currentColor" strokeWidth={0.6} opacity={0.6} />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })()}
      {/* Plan title line */}
      {(() => {
        const a = P(plan.o[0] + 3, plan.o[1] + 5, plan.o[2]);
        const b = P(plan.o[0] + plan.w - 3, plan.o[1] + 5, plan.o[2]);
        return <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="currentColor" strokeWidth={1.0} opacity={0.7} />;
      })()}

      {/* --- NOTEBOOK plane --------------------------------------- */}
      <ScaledPlane
        origin={notebook.o}
        size={[notebook.w, notebook.d]}
        fillOpacity={0.1}
        strokeOpacity={0.85}
        strokeWidth={1.2}
      />
      {/* Notebook label — near bottom-right edge, below the chart */}
      {(() => {
        const p = P(notebook.o[0] + notebook.w - 18, notebook.o[1] + notebook.d + 3, notebook.o[2]);
        return (
          <text
            x={p.sx}
            y={p.sy}
            fontFamily="ui-monospace, monospace"
            fontSize={4.2}
            letterSpacing="1"
            fill="currentColor"
            opacity={0.8}
          >
            NOTEBOOK
          </text>
        );
      })()}
      {/* Spiral binding */}
      {(() => {
        return [0, 1, 2, 3, 4, 5].map((i) => {
          const p = P(notebook.o[0] + 1.5, notebook.o[1] + 2 + i * 3.5, notebook.o[2]);
          return (
            <ellipse
              key={i}
              cx={p.sx}
              cy={p.sy}
              rx={1.4}
              ry={0.8}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.8}
              opacity={0.8}
            />
          );
        });
      })()}
      {/* Code chip */}
      {(() => {
        const a = P(notebook.o[0] + 5, notebook.o[1] + 3, notebook.o[2]);
        const b = P(notebook.o[0] + notebook.w - 3, notebook.o[1] + 3, notebook.o[2]);
        const c = P(notebook.o[0] + notebook.w - 3, notebook.o[1] + 12, notebook.o[2]);
        const d = P(notebook.o[0] + 5, notebook.o[1] + 12, notebook.o[2]);
        return (
          <g>
            <polygon
              points={poly([a, b, c, d])}
              fill="currentColor"
              fillOpacity={0.18}
              stroke="currentColor"
              strokeWidth={1.0}
              strokeLinejoin="round"
            />
            {[0, 1, 2].map((i) => {
              const la = P(notebook.o[0] + 6.5, notebook.o[1] + 5 + i * 2, notebook.o[2]);
              const lb = P(notebook.o[0] + notebook.w - 5 - i * 3, notebook.o[1] + 5 + i * 2, notebook.o[2]);
              return (
                <line
                  key={i}
                  x1={la.sx}
                  y1={la.sy}
                  x2={lb.sx}
                  y2={lb.sy}
                  stroke="currentColor"
                  strokeWidth={0.7}
                  opacity={0.9}
                />
              );
            })}
          </g>
        );
      })()}
      {/* Output chip w/ mini chart */}
      {(() => {
        const a = P(notebook.o[0] + 5, notebook.o[1] + 14, notebook.o[2]);
        const b = P(notebook.o[0] + notebook.w - 3, notebook.o[1] + 14, notebook.o[2]);
        const c = P(notebook.o[0] + notebook.w - 3, notebook.o[1] + 22, notebook.o[2]);
        const d = P(notebook.o[0] + 5, notebook.o[1] + 22, notebook.o[2]);
        const baseY = c.sy - 1.5;
        return (
          <g>
            <polygon
              points={poly([a, b, c, d])}
              fill="currentColor"
              fillOpacity={0.1}
              stroke="currentColor"
              strokeWidth={0.9}
              strokeLinejoin="round"
            />
            {[1.5, 2.8, 4, 5.5, 6.5].map((h, i) => {
              const bx = a.sx + 2 + i * 3;
              return (
                <rect
                  key={i}
                  x={bx}
                  y={baseY - h}
                  width={1.8}
                  height={h}
                  fill="currentColor"
                  opacity={0.95}
                />
              );
            })}
          </g>
        );
      })()}

      {/* --- Flow channels ---------------------------------------- */}
      <FlowChannel
        from={[chatOutPt.sx, chatOutPt.sy]}
        to={[planInPt.sx, planInPt.sy]}
        curvature={0.35}
        strokeWidth={1.4}
        tracer
      />
      <FlowChannel
        from={[planOutPt.sx, planOutPt.sy]}
        to={[notebookInPt.sx, notebookInPt.sy]}
        curvature={-0.35}
        strokeWidth={1.4}
        dashed
        dashPattern="4 3"
        tracer
      />

      <Marker at={[chatOutPt.sx, chatOutPt.sy]} kind="halo" size={1.6} />
      <Marker at={[planInPt.sx, planInPt.sy]} kind="ring" size={1.8} />
      <Marker at={[planOutPt.sx, planOutPt.sy]} kind="dot" size={2.0} />
      <Marker at={[notebookInPt.sx, notebookInPt.sy]} kind="halo" size={1.8} />
    </SceneFrame>
  );
};
