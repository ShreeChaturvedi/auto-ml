/**
 * Shared primitives for the booklet's axonometric / structural diagrams.
 *
 * Extracted from `poster/src/visuals/LangGraphDiagram.tsx` so the booklet's
 * preprocessing FSM (page 17), MCP registry (18), sandbox architecture (19),
 * and sprint timeline (24/25) share the poster's design system without
 * depending on the runtime-graph content.
 *
 * When the poster's diagram primitives evolve, reconcile by hand — see
 * `../visuals/README.md` for the cross-workspace copy contract.
 */

import type { CSSProperties } from "react";
import { COLORS } from "../theme";

export type Tier =
  | "entry_end"
  | "deterministic"
  | "llm_delegated"
  | "action"
  | "human_in_loop";

export type NodeSpec = {
  id: string;
  label: string;
  sublabel?: string;
  tier: Tier;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TierStyle = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  textFill: string;
  subFill: string;
  rx: number;
};

// Shared corner radius + stroke tokens match the poster's LangGraphDiagram.
// Previously rx=6 / stroke=1.25 read as anemic at booklet print scale; the
// poster uses rx=14 / stroke=2–2.5, which we adopt here verbatim so booklet
// diagrams inherit the same print-grade weight.
export const tierStyle = (tier: Tier): TierStyle => {
  switch (tier) {
    case "entry_end":
      return {
        fill: COLORS.SURFACE,
        stroke: COLORS.HAIRLINE_STRONG,
        strokeWidth: 2,
        textFill: COLORS.INK,
        subFill: COLORS.INK_MUTED,
        rx: 999,
      };
    case "deterministic":
      return {
        fill: "#FFFFFF",
        stroke: COLORS.INK,
        strokeWidth: 2,
        textFill: COLORS.INK,
        subFill: COLORS.INK_MUTED,
        rx: 14,
      };
    case "llm_delegated":
      return {
        fill: "#FFFFFF",
        stroke: COLORS.ACCENT,
        strokeWidth: 2,
        strokeDasharray: "5 4",
        textFill: COLORS.ACCENT_DEEP,
        subFill: COLORS.INK_MUTED,
        rx: 14,
      };
    case "action":
      return {
        fill: COLORS.INK,
        stroke: COLORS.INK,
        strokeWidth: 2.5,
        textFill: "#FFFFFF",
        subFill: "rgba(255,255,255,0.72)",
        rx: 14,
      };
    case "human_in_loop":
      return {
        fill: "#FEF3C7",
        stroke: COLORS.AMBER,
        strokeWidth: 2,
        textFill: "#92400E",
        subFill: "#92400E",
        rx: 14,
      };
  }
};

// Anchor helpers ------------------------------------------------------------

export const right = (n: NodeSpec) => ({ x: n.x + n.w, y: n.y + n.h / 2 });
export const left = (n: NodeSpec) => ({ x: n.x, y: n.y + n.h / 2 });
export const top = (n: NodeSpec) => ({ x: n.x + n.w / 2, y: n.y });
export const bottom = (n: NodeSpec) => ({ x: n.x + n.w / 2, y: n.y + n.h });

/** Build a lookup map + a strict `nodeOf(id)` fetcher. */
export function nodeMap(nodes: NodeSpec[]): {
  map: Record<string, NodeSpec>;
  nodeOf: (id: string) => NodeSpec;
} {
  const map = nodes.reduce(
    (acc, n) => {
      acc[n.id] = n;
      return acc;
    },
    {} as Record<string, NodeSpec>,
  );
  const nodeOf = (id: string): NodeSpec => {
    const n = map[id];
    if (!n) throw new Error(`unknown node: ${id}`);
    return n;
  };
  return { map, nodeOf };
}

/**
 * Shared drop-shadow filter id prefix. Filter ids MUST be unique per SVG —
 * all three INSIDE diagrams render on one HTML document, so declaring
 * `id="bk-node-shadow"` three times used to collide and emit the wrong
 * shadow for whichever SVG resolved last. Use `shadowIdFor("fsm")`
 * (etc.) to get a diagram-local id that never clashes.
 */
export const SHADOW_ID = "bk-node-shadow";

export type DiagramKey = "fsm" | "mcp" | "sandbox" | "timeline";

export const shadowIdFor = (key: DiagramKey) => `${SHADOW_ID}-${key}`;

export const shadowFilterDef = (idOverride?: string) => ({
  id: idOverride ?? SHADOW_ID,
  dx: 0,
  dy: 2,
  stdDeviation: 3,
  floodColor: COLORS.INK,
  floodOpacity: 0.12,
});

/** Per-node isometric shear — used on INSIDE diagrams that lean axonometric.
 *  Applied via SVG `transform="matrix(...)"`. */
export const ISO_MATRIX = "matrix(1, -0.1, 0.6, 0.8, 0, 0)";

/** Axis-label style used by every diagram's small caption labels. */
export const captionStyle: CSSProperties = {
  letterSpacing: "0.04em",
};
