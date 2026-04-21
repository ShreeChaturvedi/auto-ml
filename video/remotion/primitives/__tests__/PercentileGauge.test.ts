import { describe, expect, it, vi } from "vitest";

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
    useVideoConfig: vi.fn(() => ({
      fps: 60,
      width: 1920,
      height: 1080,
      durationInFrames: 3600,
    })),
  };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import {
  computePercentileGauge,
  PercentileGauge,
  type PercentileGaugeProps,
} from "../PercentileGauge";
import { BENCHMARKS_PALETTE } from "../../../config/benchmarks-layout";

const base: PercentileGaugeProps = {
  theme: "light",
  x: 100,
  y: 100,
  w: 1000,
  rank: 92,
};

const renderAt = (frame: number, props: PercentileGaugeProps) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(React.createElement(PercentileGauge, props));
};

describe("computePercentileGauge", () => {
  it("markerTargetX = (rank/100) * w", () => {
    const s = computePercentileGauge(0, { ...base, rank: 92, w: 1000 });
    expect(s.markerTargetX).toBe(920);
  });

  it("markerX = 0 at markerStartFrame, markerX = markerTargetX at settled frame", () => {
    const p: PercentileGaugeProps = {
      ...base,
      markerStartFrame: 10,
      markerDurationFrames: 40,
    };
    expect(computePercentileGauge(10, p).markerX).toBe(0);
    expect(computePercentileGauge(50, p).markerX).toBeCloseTo(
      computePercentileGauge(50, p).markerTargetX,
      5,
    );
  });

  it("trackFillProgress goes 0 → 1 across the trackDraw window", () => {
    const p: PercentileGaugeProps = {
      ...base,
      trackDrawStartFrame: 0,
      trackDrawDurationFrames: 48,
    };
    expect(computePercentileGauge(0, p).trackFillProgress).toBe(0);
    expect(computePercentileGauge(48, p).trackFillProgress).toBeCloseTo(1, 5);
    expect(computePercentileGauge(200, p).trackFillProgress).toBe(1);
  });

  it("markerSettled is false before end, true at/after", () => {
    const p: PercentileGaugeProps = {
      ...base,
      markerStartFrame: 0,
      markerDurationFrames: 42,
    };
    expect(computePercentileGauge(0, p).markerSettled).toBe(false);
    expect(computePercentileGauge(41, p).markerSettled).toBe(false);
    expect(computePercentileGauge(42, p).markerSettled).toBe(true);
    expect(computePercentileGauge(100, p).markerSettled).toBe(true);
  });
});

describe("<PercentileGauge /> rendering", () => {
  it("renders without throwing at frames 0, 60, 200", () => {
    expect(() => renderAt(0, base)).not.toThrow();
    expect(() => renderAt(60, base)).not.toThrow();
    expect(() => renderAt(200, base)).not.toThrow();
  });

  it("renders the top-tier wash with topTierTint when threshold < 100", () => {
    const markup = renderAt(200, { ...base, topTierThreshold: 90 });
    // topTierTint is "rgba(16,185,129,0.10)"; CSS serialization may add spaces.
    expect(markup).toMatch(/rgba\(\s*16\s*,\s*185\s*,\s*129\s*,\s*0?\.10?\s*\)/);
    // Sanity: the palette constant we expect is referenced somewhere.
    expect(BENCHMARKS_PALETTE.topTierTint).toBe("rgba(16,185,129,0.10)");
  });

  it("omits the top-tier wash when topTierThreshold = 100", () => {
    const markup = renderAt(200, { ...base, topTierThreshold: 100 });
    expect(markup).not.toMatch(
      /rgba\(\s*16\s*,\s*185\s*,\s*129\s*,\s*0?\.10?\s*\)/,
    );
  });

  it("renders axis tick labels when axisTicks provided", () => {
    const markup = renderAt(200, { ...base, axisTicks: [50, 75, 90] });
    expect(markup).toContain("50");
    expect(markup).toContain("75");
    expect(markup).toContain("90");
  });

  it("paints a CSS triangle (border-bottom) when baselineRank is set", () => {
    const withBaseline = renderAt(200, { ...base, baselineRank: 50 });
    const withoutBaseline = renderAt(200, { ...base });
    expect(withBaseline).toContain("border-bottom");
    expect(withBaseline.length).toBeGreaterThan(withoutBaseline.length);
  });

  it("shows callout text when showCallout !== false, hides it otherwise", () => {
    const hidden = renderAt(200, { ...base, showCallout: false });
    expect(hidden).not.toContain("TOP");
    // At frame 200 (well past the marker duration), rank ~= 92, so
    // `TOP ${100 - 92}%` = "TOP 8%".
    const visible = renderAt(200, { ...base });
    expect(visible).toContain("TOP 8%");
  });

  it("clamps the track fill to markerX at settle (rank 92 ⇒ ~920 of 1000)", () => {
    // Past marker duration and track draw, markerX ≈ 920 (rank/100 * w).
    // Fill width must stop at markerX, not extend to full w=1000.
    const markup = renderAt(200, {
      ...base,
      rank: 92,
      w: 1000,
      markerStartFrame: 0,
      markerDurationFrames: 42,
      trackDrawStartFrame: 0,
      trackDrawDurationFrames: 48,
    });
    // Extract numeric widths from the rendered markup.
    const widthMatches = Array.from(
      markup.matchAll(/width:\s*(\d+(?:\.\d+)?)px/g),
    ).map((m) => Number(m[1]));
    // At settle the fill should be ~920; never 1000 (full track width).
    expect(widthMatches).toContain(920);
    // The only 1000-wide element is the track background rail itself; make
    // sure the ink fill is distinct by asserting 920 appears in the width set.
    expect(widthMatches.filter((w) => w === 920).length).toBeGreaterThan(0);
  });

  it("heroCallout: true pops in via ScaleInNumber (transform: scale signature)", () => {
    const markup = renderAt(200, { ...base, heroCallout: true });
    expect(markup).toContain("TOP 8%");
    expect(markup).toContain("transform:scale(");
  });

  it("heroCallout: false uses fade/translate (translateY signature), no scale", () => {
    const markup = renderAt(200, { ...base });
    expect(markup).toContain("TOP 8%");
    expect(markup).toContain("translateY(");
  });
});
