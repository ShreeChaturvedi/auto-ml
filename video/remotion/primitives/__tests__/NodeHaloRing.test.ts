import { describe, expect, it, vi } from "vitest";

vi.mock("../../../config/fonts", () => ({
  REGULAR_FONT: {},
  TITLE_FONT: {},
  SERIF_FONT: {},
  MONOSPACE_FONT: {},
  ENDCARD_FONT: {},
  waitForFonts: async () => {},
}));

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return { ...actual, useCurrentFrame: vi.fn(() => 0) };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import {
  BreathingHaloRing,
  NodeHaloRing,
  computeBreathingHaloRing,
  computeNodeHaloRing,
  type BreathingHaloRingProps,
  type NodeHaloRingProps,
} from "../NodeHaloRing";

const base: NodeHaloRingProps = { x: 100, y: 200, w: 220, h: 72 };

describe("computeNodeHaloRing", () => {
  it("is inactive before the pulse window", () => {
    expect(computeNodeHaloRing(-1, { ...base, at: 0 }).active).toBe(false);
  });

  it("is inactive after the pulse window", () => {
    const s = computeNodeHaloRing(37, { ...base, at: 0, durationFrames: 36 });
    expect(s.active).toBe(false);
    expect(s.opacity).toBe(0);
  });

  it("opacity is 0 at window open", () => {
    const s = computeNodeHaloRing(0, { ...base, at: 0, durationFrames: 36 });
    expect(s.opacity).toBe(0);
  });

  it("opacity peaks at window midpoint", () => {
    const s = computeNodeHaloRing(18, { ...base, at: 0, durationFrames: 36 });
    expect(s.opacity).toBeCloseTo(0.8, 5);
  });

  it("opacity is 0 at window close", () => {
    const s = computeNodeHaloRing(36, { ...base, at: 0, durationFrames: 36 });
    expect(s.opacity).toBe(0);
  });

  it("scale goes 1 → 1.25 across the window", () => {
    expect(computeNodeHaloRing(0, { ...base, at: 0 }).scale).toBe(1);
    expect(
      computeNodeHaloRing(36, { ...base, at: 0, durationFrames: 36 }).scale,
    ).toBeCloseTo(1.25, 5);
  });
});

describe("computeBreathingHaloRing", () => {
  const bp: BreathingHaloRingProps = { x: 0, y: 0, w: 220, h: 72 };

  it("holds min values before `at`", () => {
    const s = computeBreathingHaloRing(-1, { ...bp, at: 0 });
    expect(s.opacity).toBe(0.3);
    expect(s.scale).toBe(1.0);
  });

  it("hits peak at frame 0 (period start, cos=1)", () => {
    const s = computeBreathingHaloRing(0, { ...bp, at: 0 });
    expect(s.opacity).toBeCloseTo(0.7, 5);
    expect(s.scale).toBeCloseTo(1.03, 5);
  });

  it("hits trough at period/2 (cos=-1)", () => {
    const s = computeBreathingHaloRing(60, {
      ...bp,
      at: 0,
      periodFrames: 120,
    });
    expect(s.opacity).toBeCloseTo(0.3, 5);
    expect(s.scale).toBeCloseTo(1.0, 5);
  });

  it("loops — equal to start after full period", () => {
    const s = computeBreathingHaloRing(120, {
      ...bp,
      at: 0,
      periodFrames: 120,
    });
    expect(s.opacity).toBeCloseTo(0.7, 5);
  });

  it("respects custom color / min-max bounds", () => {
    const s = computeBreathingHaloRing(0, {
      ...bp,
      at: 0,
      minOpacity: 0.2,
      maxOpacity: 0.9,
    });
    expect(s.opacity).toBeCloseTo(0.9, 5);
  });
});

describe("<NodeHaloRing /> rendering", () => {
  const renderAt = (frame: number, props: NodeHaloRingProps) => {
    vi.mocked(useCurrentFrame).mockReturnValue(frame);
    return renderToStaticMarkup(React.createElement(NodeHaloRing, props));
  };

  it("renders nothing outside the window", () => {
    expect(renderAt(60, { ...base, at: 0, durationFrames: 36 })).toBe("");
  });

  it("renders a <rect> inside the window", () => {
    const markup = renderAt(18, { ...base, at: 0, durationFrames: 36 });
    expect(markup).toContain("<rect");
  });
});

describe("<BreathingHaloRing /> rendering", () => {
  const renderAt = (frame: number, props: BreathingHaloRingProps) => {
    vi.mocked(useCurrentFrame).mockReturnValue(frame);
    return renderToStaticMarkup(React.createElement(BreathingHaloRing, props));
  };

  const bp: BreathingHaloRingProps = { x: 0, y: 0, w: 220, h: 72 };

  it("always renders a <rect> (continuous loop)", () => {
    expect(renderAt(0, bp)).toContain("<rect");
    expect(renderAt(999, bp)).toContain("<rect");
  });
});
