import { describe, expect, it, vi } from "vitest";

// Fonts load at module eval via FontFace (not available in Node) — stub them
// out so tests that import primitives touching config/fonts don't explode.
vi.mock("../../../config/fonts", () => ({
  REGULAR_FONT: { fontFamily: "sans-serif", fontWeight: 500 },
  TITLE_FONT: { fontFamily: "sans-serif", fontWeight: 700 },
  SERIF_FONT: { fontFamily: "serif", fontWeight: 400 },
  MONOSPACE_FONT: { fontFamily: "monospace", fontWeight: 500 },
  ENDCARD_FONT: { fontFamily: "sans-serif", fontWeight: 600 },
  waitForFonts: async () => {},
}));

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: vi.fn(() => 0),
    useVideoConfig: vi.fn(() => ({ fps: 60, width: 1920, height: 1080, durationInFrames: 3600 })),
  };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import {
  computeGraphNode,
  GraphNode,
  type GraphNodeProps,
} from "../GraphNode";
import { ARCH_PALETTE } from "../../../config/arch-layout";

const base: GraphNodeProps = { label: "prepare", x: 100, y: 100 };

const renderAt = (frame: number, props: GraphNodeProps) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(React.createElement(GraphNode, props));
};

describe("computeGraphNode", () => {
  it("is invisible (opacity 0) at progress 0", () => {
    expect(computeGraphNode(0, 0, base).opacity).toBe(0);
  });

  it("is fully visible at progress 1", () => {
    expect(computeGraphNode(100, 1, base).opacity).toBe(1);
  });

  it("scales 0.96 → 1 across the enter window", () => {
    expect(computeGraphNode(0, 0, base).scale).toBeCloseTo(0.96, 5);
    expect(computeGraphNode(100, 1, base).scale).toBe(1);
  });

  it("applies solid 1.5px ink border on the deterministic tier (idle)", () => {
    const k = computeGraphNode(100, 1, { ...base, tier: "deterministic" });
    expect(k.border).toBe(`1.5px solid ${ARCH_PALETTE.ink}`);
    expect(k.background).toBe(ARCH_PALETTE.paperAlt);
    expect(k.innerRing).toBeNull();
  });

  it("applies dashed 4-2 + inner ring on the llm_delegated tier (idle)", () => {
    const k = computeGraphNode(100, 1, { ...base, tier: "llm_delegated" });
    expect(k.border).toContain("dashed");
    expect(k.innerRing).toContain(ARCH_PALETTE.llmNodeRing);
  });

  it("text tier uses paper bg, thinner 1px border", () => {
    const k = computeGraphNode(100, 1, { ...base, tier: "text" });
    expect(k.background).toBe(ARCH_PALETTE.paper);
    expect(k.border).toBe(`1px solid ${ARCH_PALETTE.ink}`);
  });

  it("action tier fills ink with white text, no border", () => {
    const k = computeGraphNode(100, 1, { ...base, tier: "action" });
    expect(k.background).toBe(ARCH_PALETTE.ink);
    expect(k.textColor).toBe("#FFFFFF");
    expect(k.border).toContain("0px");
  });

  it("active status overrides to 2px accent-blue solid border", () => {
    const k = computeGraphNode(100, 1, { ...base, status: "active" });
    expect(k.border).toBe(`2px solid ${ARCH_PALETTE.accentBlue}`);
  });

  it("retry status overrides to 2px amber solid border", () => {
    const k = computeGraphNode(100, 1, { ...base, status: "retry" });
    expect(k.border).toBe(`2px solid ${ARCH_PALETTE.amber}`);
  });

  it("success status overrides to 2px green solid border", () => {
    const k = computeGraphNode(100, 1, { ...base, status: "success" });
    expect(k.border).toBe(`2px solid ${ARCH_PALETTE.successGreen}`);
  });

  it("approval status switches to dashed 6-4", () => {
    const k = computeGraphNode(100, 1, { ...base, status: "approval" });
    expect(k.border).toContain("dashed");
  });

  it("background prop overrides the tier default fill", () => {
    const k = computeGraphNode(100, 1, { ...base, background: "#FFEEDD" });
    expect(k.background).toBe("#FFEEDD");
  });

  it("borderColor prop overrides the tier+status default", () => {
    const k = computeGraphNode(100, 1, {
      ...base,
      status: "active",
      borderColor: "#123456",
    });
    expect(k.borderColor).toBe("#123456");
    expect(k.border).toContain("#123456");
  });

  it("textColor prop overrides the tier default text", () => {
    const k = computeGraphNode(100, 1, {
      ...base,
      tier: "action",
      textColor: "#0F0F0F",
    });
    expect(k.textColor).toBe("#0F0F0F");
  });

  it("innerRing=false disables the llm_delegated tier inner ring", () => {
    const k = computeGraphNode(100, 1, {
      ...base,
      tier: "llm_delegated",
      innerRing: false,
    });
    expect(k.innerRing).toBeNull();
  });

  it("innerRing string overrides the tier default ring", () => {
    const k = computeGraphNode(100, 1, {
      ...base,
      tier: "llm_delegated",
      innerRing: "inset 0 0 0 4px red",
    });
    expect(k.innerRing).toBe("inset 0 0 0 4px red");
  });
});

describe("<GraphNode /> rendering", () => {
  it("renders without throwing at pre/mid/post enter frames", () => {
    expect(() => renderAt(0, base)).not.toThrow();
    expect(() => renderAt(12, base)).not.toThrow();
    expect(() => renderAt(60, base)).not.toThrow();
  });

  it("paints the label text at the settled frame", () => {
    const markup = renderAt(120, base);
    expect(markup).toContain("prepare");
  });

  it("paints the subtitle when supplied", () => {
    const markup = renderAt(120, { ...base, subtitle: "9 stages" });
    expect(markup).toContain("9 stages");
  });

  it("applies accent-blue border when status=active", () => {
    const markup = renderAt(120, { ...base, status: "active" });
    expect(markup).toContain(ARCH_PALETTE.accentBlue);
  });

  it("renders an SVG overlay for the llm_delegated dashed border", () => {
    const markup = renderAt(120, { ...base, tier: "llm_delegated" });
    expect(markup).toContain("<svg");
    expect(markup).toMatch(/stroke-dasharray="4 2"/);
  });

  it("renders an SVG overlay for the approval dashed border", () => {
    const markup = renderAt(120, { ...base, status: "approval" });
    expect(markup).toMatch(/stroke-dasharray="6 4"/);
  });
});
