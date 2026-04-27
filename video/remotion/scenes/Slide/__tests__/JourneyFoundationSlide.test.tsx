import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../config/fonts", () => ({
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
    useVideoConfig: vi.fn(() => ({ fps: 60, width: 1920, height: 1080, durationInFrames: 480 })),
  };
});

vi.mock("../../../primitives/SlideShell", () => ({
  SlideShell: ({ eyebrow, children }: { eyebrow?: string; children: React.ReactNode }) => (
    <div data-testid="slide-shell">
      {eyebrow ? <div data-testid="eyebrow">{eyebrow}</div> : null}
      {children}
    </div>
  ),
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import { JourneyFoundationSlide } from "../JourneyFoundationSlide";

const renderAt = (frame: number) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(<JourneyFoundationSlide theme="light" meta={undefined} />);
};

describe("<JourneyFoundationSlide />", () => {
  it("renders without throwing across phase-boundary frames", () => {
    for (const frame of [0, 30, 90, 130, 220, 310, 390, 479]) {
      expect(() => renderAt(frame)).not.toThrow();
    }
  });

  it("renders the SPRINTS 1-4 · FOUNDATION active header cell at frame 30+", () => {
    const markup = renderAt(60);
    expect(markup).toContain("SPRINTS 1-4");
    expect(markup).toContain("FOUNDATION");
  });

  it("renders the serif italic hero line at frame 90+", () => {
    const markup = renderAt(120);
    expect(markup).toContain("A backend, a UI shell");
  });

  it("renders all 3 MetricCard eyebrows at frame 220+", () => {
    const markup = renderAt(260);
    expect(markup).toContain("COMMITS");
    expect(markup).toContain("ISSUES");
    expect(markup).toContain("MERGE REQUESTS");
  });

  it("renders all three milestone labels at frame 390+", () => {
    const markup = renderAt(410);
    expect(markup).toContain("repo spark");
    expect(markup).toContain("phase-based FE navigation");
    expect(markup).toContain("first NL→SQL queries shipping");
  });

  it("renders the foundation accent color (accentBlue) in milestone labels", () => {
    const markup = renderAt(420).toLowerCase();
    expect(markup).toContain("#1d4ed8");
  });
});
