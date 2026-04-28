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
  computeRetryCurve,
  quadraticLength,
  RetryCurve,
  sampleQuadratic,
  type RetryCurveProps,
} from "../RetryCurve";

describe("sampleQuadratic", () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 10, y: 10 };
  const p2 = { x: 20, y: 0 };

  it("returns p0 at t=0", () => {
    expect(sampleQuadratic(p0, p1, p2, 0)).toEqual(p0);
  });

  it("returns p2 at t=1", () => {
    expect(sampleQuadratic(p0, p1, p2, 1)).toEqual(p2);
  });

  it("passes through the expected midpoint at t=0.5", () => {
    // B(0.5) = 0.25·p0 + 0.5·p1 + 0.25·p2 = (10, 5)
    const m = sampleQuadratic(p0, p1, p2, 0.5);
    expect(m.x).toBeCloseTo(10, 5);
    expect(m.y).toBeCloseTo(5, 5);
  });
});

describe("quadraticLength", () => {
  it("approximates a straight segment (control on line) to its linear length", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 0 };
    const p2 = { x: 100, y: 0 };
    const est = quadraticLength(p0, p1, p2, 32);
    expect(est).toBeCloseTo(100, 1);
  });

  it("exceeds the straight-line distance for a bulged curve", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 200 };
    const p2 = { x: 100, y: 0 };
    expect(quadraticLength(p0, p1, p2, 64)).toBeGreaterThan(100);
  });
});

describe("computeRetryCurve", () => {
  const base: RetryCurveProps = {
    from: { x: 0, y: 0 },
    control: { x: 50, y: 100 },
    to: { x: 100, y: 0 },
    drawStartFrame: 0,
    drawDurationFrames: 48,
  };

  it("dashoffset = length at start (hidden)", () => {
    const s = computeRetryCurve(0, base);
    expect(s.dashoffset).toBeCloseTo(s.length, 5);
  });

  it("dashoffset = 0 after drawDurationFrames (fully drawn)", () => {
    expect(computeRetryCurve(48, base).dashoffset).toBe(0);
  });

  it("no bead when beadStartFrame omitted", () => {
    expect(computeRetryCurve(30, base).bead).toBeNull();
  });

  it("bead starts at `from` at beadStartFrame", () => {
    const p: RetryCurveProps = {
      ...base,
      beadStartFrame: 60,
      beadDurationFrames: 40,
    };
    const s = computeRetryCurve(60, p);
    expect(s.bead!.cx).toBeCloseTo(0, 5);
    expect(s.bead!.cy).toBeCloseTo(0, 5);
  });

  it("bead lands at `to` at beadStartFrame + beadDurationFrames", () => {
    const p: RetryCurveProps = {
      ...base,
      beadStartFrame: 60,
      beadDurationFrames: 40,
    };
    const s = computeRetryCurve(100, p);
    expect(s.bead!.cx).toBeCloseTo(100, 5);
    expect(s.bead!.cy).toBeCloseTo(0, 5);
  });
});

describe("<RetryCurve /> rendering", () => {
  const base: RetryCurveProps = {
    from: { x: 10, y: 10 },
    control: { x: 60, y: 80 },
    to: { x: 110, y: 10 },
  };

  it("renders a <path> element", () => {
    vi.mocked(useCurrentFrame).mockReturnValue(24);
    const markup = renderToStaticMarkup(React.createElement(RetryCurve, base));
    expect(markup).toContain("<path");
  });
});
