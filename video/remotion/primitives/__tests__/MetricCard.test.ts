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
    useVideoConfig: vi.fn(() => ({ fps: 60, width: 1920, height: 1080, durationInFrames: 3600 })),
  };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import { computeMetricCard, MetricCard, type MetricCardProps } from "../MetricCard";
import { COLORS } from "../../../config/themes";

const base: MetricCardProps = {
  theme: "light",
  x: 100,
  y: 100,
  eyebrow: "LABEL",
  value: 80,
};

const renderAt = (frame: number, props: MetricCardProps = base) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(React.createElement(MetricCard, props));
};

describe("computeMetricCard", () => {
  it("is invisible and pre-settle at enterProgress 0", () => {
    const state = computeMetricCard(0, 0, 0, base);
    expect(state.opacity).toBe(0);
    expect(state.scale).toBeCloseTo(0.96, 5);
    expect(state.translateY).toBe(16);
  });

  it("is fully visible and settled at enterProgress 1", () => {
    const state = computeMetricCard(200, 1, 0, base);
    expect(state.opacity).toBe(1);
    expect(state.scale).toBe(1);
    expect(state.translateY).toBe(0);
  });

  it("resting border matches theme hairline when highlight is true and progress 0", () => {
    const state = computeMetricCard(0, 0, 0, { ...base, highlight: true });
    expect(state.borderColor).toBe(COLORS.light.BORDER_COLOR);
  });

  it("full highlight produces the accent color when progress 1", () => {
    const state = computeMetricCard(200, 1, 1, { ...base, highlight: true });
    expect(state.borderColor).toBe(COLORS.light.ACCENT_COLOR);
  });
});

describe("<MetricCard /> rendering", () => {
  it("renders without throwing at pre/mid/post enter frames", () => {
    expect(() => renderAt(0)).not.toThrow();
    expect(() => renderAt(50)).not.toThrow();
    expect(() => renderAt(200)).not.toThrow();
  });

  it("paints eyebrow, subtitle, and formatted value at the settled frame", () => {
    const markup = renderAt(200, {
      ...base,
      eyebrow: "FOO",
      subtitle: "bar",
      value: 42,
      format: (v) => String(Math.round(v)),
    });
    expect(markup).toContain("FOO");
    expect(markup).toContain("bar");
    expect(markup).toContain("42");
  });

  it("renders the hero numeral via ScaleInNumber when hero is true", () => {
    const markup = renderAt(200, {
      ...base,
      hero: true,
      value: 7,
      format: (v) => `${String(Math.round(v))}\u00D7`,
    });
    expect(markup).toContain("7\u00D7");
    expect(markup).toContain("transform:scale(");
  });

  it("renders hero numerals in TITLE_FONT (editorial), not MONOSPACE_FONT", () => {
    // Per the visual QA pass, hero numerals must match ProblemTrio/Hook/Speed
    // slides which all use TITLE_FONT. The mock maps TITLE_FONT.fontFamily to
    // "sans-serif" and MONOSPACE_FONT.fontFamily to "monospace" — so the hero
    // number container should contain the former and NOT the latter.
    const markup = renderAt(200, {
      ...base,
      hero: true,
      value: 7,
      format: (v) => `${String(Math.round(v))}\u00D7`,
    });
    // Grab the substring surrounding the hero value — it should use sans-serif.
    const heroIdx = markup.indexOf("7\u00D7");
    expect(heroIdx).toBeGreaterThan(-1);
    const windowStart = Math.max(0, heroIdx - 400);
    const windowAround = markup.slice(windowStart, heroIdx + 50);
    expect(windowAround).toContain("sans-serif");
    expect(windowAround).not.toContain("font-family:monospace");
  });

  it("renders count-up numerals in TITLE_FONT as well", () => {
    const markup = renderAt(200, {
      ...base,
      hero: false,
      value: 80,
      format: (v) => `${String(Math.round(v))}%`,
    });
    // CountUpNumber renders the final string; scan a window around it.
    const idx = markup.indexOf("80%");
    expect(idx).toBeGreaterThan(-1);
    const windowAround = markup.slice(Math.max(0, idx - 400), idx + 50);
    expect(windowAround).toContain("sans-serif");
  });

  it("renders CountUpNumber's phantom sibling when hero is false", () => {
    const markup = renderAt(200, {
      ...base,
      hero: false,
      value: 80,
      format: (v) => `${String(Math.round(v))}%`,
    });
    expect(markup).toMatch(/visibility:\s*hidden/);
  });

  it("paints the badge pill when badge is set and omits it otherwise", () => {
    const withBadge = renderAt(200, { ...base, badge: "TOP 8%" });
    expect(withBadge).toContain("TOP 8%");
    const withoutBadge = renderAt(200, base);
    expect(withoutBadge).not.toContain("TOP 8%");
  });

  it("paints the accent-blue border after the highlight window settles", () => {
    const markup = renderAt(200, { ...base, highlight: true });
    expect(markup.toLowerCase()).toContain(COLORS.light.ACCENT_COLOR.toLowerCase());
  });
});
