import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../../config/easing";
import { MONOSPACE_FONT } from "../../../../config/fonts";
import type { Theme } from "../../../../config/themes";
import { COLORS } from "../../../../config/themes";
import { AgentEdge } from "../../../primitives/AgentEdge";
import { GraphNode } from "../../../primitives/GraphNode";

// -----------------------------------------------------------------------------
// Panel 1 visual — pentagon of 5 tool GraphNodes connected by an outer ring.
//
// Replaces the linear left-to-right tile strip we used previously. The
// pentagon framing reads as "constellation of disconnected tools" rather than
// "production line" — closer to the slide's argument that the modern ML
// workflow lives in six different tools the operator must context-switch
// between, not a coherent pipeline.
//
// Geometry: 5 vertices on a circle of radius PENTAGON_R around the visual
// region's center. Vertex 0 sits at the top (angle = -π/2); subsequent
// vertices step clockwise by 2π/5 rad (72°).
//
// Animations:
//   - Each node spring-enters at focusStart + i*NODE_STAGGER (handled by
//     GraphNode's enterFrame).
//   - Each ring edge draws once both endpoints have landed (focusStart +
//     i*EDGE_STEP + EDGE_OFFSET) over EDGE_DRAW frames. Hairline neutral
//     grey, no arrowhead — these are connections, not directions.
//   - After the ring completes, every node drifts ~4 px outward from center
//     over DRIFT_FRAMES — a sustained hint at fragmentation.
//   - Stat line below fades in after the last edge finishes.
// -----------------------------------------------------------------------------

const TOOL_TILES: readonly string[] = [
  "jupyter",
  "pandas",
  "sklearn",
  "mlflow",
  "streamlit",
] as const;

const NODE_W = 90;
const NODE_H = 40;
const NODE_RADIUS = 8;
const NODE_STAGGER = 14;
const NODE_ENTER_DURATION = 22;

// Radius is set so the pentagon's vertical span (R + R·sin54° + node_h) plus
// the stat caption below fits inside the 299-px inner visual height. Spec
// suggested R=130 (assuming a 339-px inner band) but our actual inner region
// is 299 px tall, so we tighten to 115 to keep the bottom vertex node body
// off the caption baseline.
const PENTAGON_R = 115;
const EDGE_STEP = 10;
const EDGE_DRAW = 30;
const EDGE_OFFSET = NODE_ENTER_DURATION;

const DRIFT_PX = 4;
const DRIFT_FRAMES = 80;

// Inner usable region inside the panel after PANEL_PADDING=40 strips the
// chrome on a 552×640 panel: 472 wide × 299 tall (visual band 379 - 80 px).
const REGION_W = 472;
const REGION_H = 299;
const CENTER_X = REGION_W / 2; // 236
const CENTER_Y = REGION_H / 2 - 14; // lift slightly so caption breathes below

/** Pentagon vertex centers, ordered clockwise from the top. */
const VERTICES = TOOL_TILES.map((_, i) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / TOOL_TILES.length;
  return {
    cx: CENTER_X + Math.cos(angle) * PENTAGON_R,
    cy: CENTER_Y + Math.sin(angle) * PENTAGON_R,
    angle,
  };
});

export const Panel1Fragmentation: React.FC<{
  theme: Theme;
  focusStart: number;
}> = ({ theme, focusStart }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  // Drift starts once every node has landed.
  const allLanded =
    focusStart + (TOOL_TILES.length - 1) * NODE_STAGGER + NODE_ENTER_DURATION;
  const driftStart = allLanded + 10;
  const driftProgress = interpolate(
    frame,
    [driftStart, driftStart + DRIFT_FRAMES],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Stat fades in after the last ring segment finishes.
  const lastEdgeStart =
    focusStart + (TOOL_TILES.length - 1) * EDGE_STEP + EDGE_OFFSET;
  const lastEdgeDone = lastEdgeStart + EDGE_DRAW;
  const statOpacity = interpolate(
    frame,
    [lastEdgeDone + 10, lastEdgeDone + 40],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      <div
        style={{
          position: "relative",
          width: REGION_W,
          height: REGION_H - 32, // reserve room for caption underneath
        }}
      >
        {/* Ring edges — drawn before nodes so node bodies layer on top. */}
        {VERTICES.map((v, i) => {
          const next = VERTICES[(i + 1) % VERTICES.length]!;
          const drawStart = focusStart + i * EDGE_STEP + EDGE_OFFSET;
          return (
            <AgentEdge
              key={`edge-${i}`}
              x1={v.cx}
              y1={v.cy}
              x2={next.cx}
              y2={next.cy}
              drawStartFrame={drawStart}
              drawDurationFrames={EDGE_DRAW}
              color={c.WORD_COLOR_ON_BG_GREYED}
              strokeWidth={1.25}
              arrowhead={false}
            />
          );
        })}

        {/* Tool nodes — pentagon vertices. Drift outward once the ring lands.
         *  Explicit background / borderColor / textColor so the GraphNode
         *  ARCH_PALETTE defaults never silently leak into this scene. */}
        {TOOL_TILES.map((label, i) => {
          const v = VERTICES[i]!;
          const dx = Math.cos(v.angle) * DRIFT_PX * driftProgress;
          const dy = Math.sin(v.angle) * DRIFT_PX * driftProgress;
          return (
            <div
              key={label}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate(${dx}px, ${dy}px)`,
              }}
            >
              <GraphNode
                x={v.cx - NODE_W / 2}
                y={v.cy - NODE_H / 2}
                w={NODE_W}
                h={NODE_H}
                radius={NODE_RADIUS}
                tier="deterministic"
                status="idle"
                enterFrame={focusStart + i * NODE_STAGGER}
                enterDurationFrames={NODE_ENTER_DURATION}
                background={c.BACKGROUND_ELEVATED}
                borderColor={c.BORDER_COLOR}
                textColor={c.WORD_COLOR_ON_BG_APPEARED}
              >
                {/* Custom 13px monospace label — the GraphNode default of
                 *  22px uppercase doesn't fit a 90×40 chip. */}
                <span
                  style={{
                    ...MONOSPACE_FONT,
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: "-0.005em",
                    color: c.WORD_COLOR_ON_BG_APPEARED,
                    lineHeight: 1,
                  }}
                >
                  {label}
                </span>
              </GraphNode>
            </div>
          );
        })}
      </div>

      {/* Stat line — fades in after the ring completes. */}
      <div
        style={{
          ...MONOSPACE_FONT,
          fontSize: 16,
          fontVariantNumeric: "tabular-nums",
          color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: statOpacity,
          letterSpacing: "0.02em",
          marginTop: 12,
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <span>
          <span style={{ color: c.WORD_COLOR_ON_BG_APPEARED, fontWeight: 600 }}>4</span>
          {" languages"}
        </span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span>
          <span style={{ color: c.WORD_COLOR_ON_BG_APPEARED, fontWeight: 600 }}>11</span>
          {" context switches / hr"}
        </span>
      </div>
    </div>
  );
};
