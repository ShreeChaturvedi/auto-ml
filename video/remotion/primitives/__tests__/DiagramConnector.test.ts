import { describe, expect, it, vi } from "vitest";

// Mock Remotion's frame hook so we can render without a composition context.
// Each test sets the desired frame via vi.mocked(useCurrentFrame).mockReturnValue.
vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return { ...actual, useCurrentFrame: vi.fn(() => 0) };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import {
  computeDiagramConnector,
  DiagramConnector,
  type DiagramConnectorProps,
} from "../DiagramConnector";

/** Render <DiagramConnector /> at `frame` and return the raw SVG markup. */
const renderAt = (frame: number, props: DiagramConnectorProps): string => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(React.createElement(DiagramConnector, props));
};

/** Pull a numeric attribute off the markup (e.g. stroke-dashoffset="42.5"). */
const attr = (markup: string, name: string): string | null => {
  const m = new RegExp(`${name}="([^"]+)"`).exec(markup);
  return m ? m[1]! : null;
};

const numAttr = (markup: string, name: string): number => {
  const v = attr(markup, name);
  if (v === null) throw new Error(`attribute ${name} not found in: ${markup}`);
  return Number(v);
};

describe("computeDiagramConnector", () => {
  const base: DiagramConnectorProps = {
    height: 100,
    drawStartFrame: 10,
    drawDurationFrames: 20,
  };

  it("has full dashoffset one frame before drawStartFrame (not drawn)", () => {
    const s = computeDiagramConnector(9, base);
    expect(s.dashoffset).toBe(100);
    expect(s.length).toBe(100);
  });

  it("has zero dashoffset once drawDurationFrames have elapsed (fully drawn)", () => {
    const s = computeDiagramConnector(10 + 20, base);
    expect(s.dashoffset).toBe(0);
  });

  it("dashoffset monotonically decreases across the draw window", () => {
    const mid = computeDiagramConnector(20, base).dashoffset;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
  });

  it("returns null pulse when pulseStartFrame is omitted", () => {
    expect(computeDiagramConnector(50, base).pulse).toBeNull();
    expect(computeDiagramConnector(200, base).pulse).toBeNull();
  });

  it("returns null pulse outside the pulse window", () => {
    const p: DiagramConnectorProps = {
      ...base,
      pulseStartFrame: 60,
      pulseDurationFrames: 30,
    };
    expect(computeDiagramConnector(59, p).pulse).toBeNull();
    expect(computeDiagramConnector(91, p).pulse).toBeNull();
  });

  it("pulse cy travels from 0 → height across the window under EASE_IN_OUT", () => {
    const p: DiagramConnectorProps = {
      ...base,
      pulseStartFrame: 60,
      pulseDurationFrames: 30,
    };
    // Start: dot at the top.
    expect(computeDiagramConnector(60, p).pulse!.cy).toBe(0);
    // End: dot reaches the bottom.
    expect(computeDiagramConnector(90, p).pulse!.cy).toBeCloseTo(100, 5);
    // Mid-window: between start and end, monotonically increasing.
    const s = computeDiagramConnector(75, p); // midpoint of [60, 90]
    expect(s.pulse).not.toBeNull();
    expect(s.pulse!.cy).toBeGreaterThan(0);
    expect(s.pulse!.cy).toBeLessThan(100);
  });

  it("pulse opacity ramps up during the first 6 frames of the window", () => {
    const p: DiagramConnectorProps = {
      ...base,
      pulseStartFrame: 60,
      pulseDurationFrames: 30,
    };
    expect(computeDiagramConnector(60, p).pulse!.opacity).toBe(0);
    expect(computeDiagramConnector(63, p).pulse!.opacity).toBeCloseTo(0.5, 5);
    expect(computeDiagramConnector(66, p).pulse!.opacity).toBe(1);
  });

  it("pulse opacity ramps down during the last 6 frames of the window", () => {
    const p: DiagramConnectorProps = {
      ...base,
      pulseStartFrame: 60,
      pulseDurationFrames: 30,
    };
    expect(computeDiagramConnector(90, p).pulse!.opacity).toBe(0);
    expect(computeDiagramConnector(87, p).pulse!.opacity).toBeCloseTo(0.5, 5);
    expect(computeDiagramConnector(84, p).pulse!.opacity).toBe(1);
  });

  it("strokeOpacity is 1 at late frames when shimmerStartFrame is omitted", () => {
    expect(computeDiagramConnector(500, base).strokeOpacity).toBe(1);
  });

  it("strokeOpacity hits the trough (≈0.4) at shimmerStartFrame + period/2", () => {
    const p: DiagramConnectorProps = {
      ...base,
      shimmerStartFrame: 100,
      shimmerPeriodFrames: 120,
    };
    expect(computeDiagramConnector(100, p).strokeOpacity).toBeCloseTo(1, 4);
    expect(computeDiagramConnector(160, p).strokeOpacity).toBeCloseTo(0.4, 4);
    expect(computeDiagramConnector(220, p).strokeOpacity).toBeCloseTo(1, 4);
  });

  it("shimmer is inert before shimmerStartFrame", () => {
    const p: DiagramConnectorProps = {
      ...base,
      shimmerStartFrame: 100,
      shimmerPeriodFrames: 120,
    };
    expect(computeDiagramConnector(50, p).strokeOpacity).toBe(1);
    expect(computeDiagramConnector(99, p).strokeOpacity).toBe(1);
  });
});

describe("<DiagramConnector /> rendering", () => {
  const base: DiagramConnectorProps = {
    height: 100,
    drawStartFrame: 10,
    drawDurationFrames: 20,
  };

  it("renders without throwing at frame 0, mid-draw, post-draw, mid-pulse, post-pulse, mid-shimmer", () => {
    const full: DiagramConnectorProps = {
      ...base,
      pulseStartFrame: 40,
      pulseDurationFrames: 30,
      shimmerStartFrame: 80,
      shimmerPeriodFrames: 120,
    };
    expect(() => renderAt(0, full)).not.toThrow();
    expect(() => renderAt(20, full)).not.toThrow(); // mid-draw
    expect(() => renderAt(35, full)).not.toThrow(); // post-draw
    expect(() => renderAt(55, full)).not.toThrow(); // mid-pulse
    expect(() => renderAt(75, full)).not.toThrow(); // post-pulse
    expect(() => renderAt(140, full)).not.toThrow(); // mid-shimmer (trough region)
  });

  it("dashoffset equals full height at drawStartFrame - 1", () => {
    const markup = renderAt(9, base);
    expect(numAttr(markup, "stroke-dashoffset")).toBe(100);
  });

  it("dashoffset equals 0 at drawStartFrame + drawDurationFrames", () => {
    const markup = renderAt(30, base);
    expect(numAttr(markup, "stroke-dashoffset")).toBe(0);
  });

  it("omits <circle> when pulseStartFrame is undefined", () => {
    const markup = renderAt(100, base);
    expect(markup).not.toContain("<circle");
  });

  it("omits <circle> before the pulse window opens", () => {
    const p: DiagramConnectorProps = {
      ...base,
      pulseStartFrame: 60,
      pulseDurationFrames: 30,
    };
    const markup = renderAt(59, p);
    expect(markup).not.toContain("<circle");
  });

  it("includes <circle> inside the pulse window with cy in (0, height)", () => {
    const p: DiagramConnectorProps = {
      ...base,
      pulseStartFrame: 60,
      pulseDurationFrames: 30,
    };
    const markup = renderAt(75, p); // midpoint of [60, 90]
    expect(markup).toContain("<circle");
    const cy = numAttr(markup, "cy");
    expect(cy).toBeGreaterThan(0);
    expect(cy).toBeLessThan(100);
  });

  it("stroke opacity is 1 at late frames when shimmer is omitted", () => {
    const markup = renderAt(500, base);
    expect(numAttr(markup, "opacity")).toBe(1);
  });

  it("stroke opacity is ≈0.4 at shimmerStartFrame + period/2 (trough)", () => {
    const p: DiagramConnectorProps = {
      ...base,
      shimmerStartFrame: 100,
      shimmerPeriodFrames: 120,
    };
    const markup = renderAt(160, p);
    expect(numAttr(markup, "opacity")).toBeCloseTo(0.4, 4);
  });

  it("uses strokeColor for the hairline and falls back to it for the pulse", () => {
    const p: DiagramConnectorProps = {
      ...base,
      strokeColor: "#123456",
      pulseStartFrame: 60,
      pulseDurationFrames: 30,
    };
    const markup = renderAt(75, p);
    // stroke on the line
    expect(markup).toMatch(/stroke="#123456"/);
    // pulse dot falls back to strokeColor when pulseColor is unset
    expect(markup).toMatch(/fill="#123456"/);
  });

  it("uses pulseColor for the dot when supplied (overrides strokeColor)", () => {
    const p: DiagramConnectorProps = {
      ...base,
      strokeColor: "#123456",
      pulseColor: "#FF0000",
      pulseStartFrame: 60,
      pulseDurationFrames: 30,
    };
    const markup = renderAt(75, p);
    expect(markup).toMatch(/fill="#FF0000"/);
  });
});
