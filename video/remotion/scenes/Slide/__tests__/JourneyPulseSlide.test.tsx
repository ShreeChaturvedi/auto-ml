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
    useVideoConfig: vi.fn(() => ({ fps: 60, width: 1920, height: 1080, durationInFrames: 600 })),
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
import { JourneyPulseSlide } from "../JourneyPulseSlide";

const renderAt = (frame: number) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(<JourneyPulseSlide theme="light" meta={undefined} />);
};

describe("<JourneyPulseSlide />", () => {
  it("renders without throwing across phase-boundary frames", () => {
    for (const frame of [0, 30, 60, 110, 170, 260, 300, 340, 400, 599]) {
      expect(() => renderAt(frame)).not.toThrow();
    }
  });

  it("renders the YEAR IN COMMITS eyebrow by frame 30", () => {
    const markup = renderAt(60);
    expect(markup).toContain("YEAR IN COMMITS");
  });

  it("renders the hero title with 'Eleven months' at frame 80+", () => {
    const markup = renderAt(80);
    expect(markup).toContain("Eleven months");
  });

  it("renders the 'product.' flourish target in the title", () => {
    const markup = renderAt(100);
    expect(markup).toContain("product.");
  });

  it("renders the 2,123 / 324 / 153 counter totals after count-ups settle", () => {
    const markup = renderAt(500);
    expect(markup).toContain("2,123");
    expect(markup).toContain("324");
    expect(markup).toContain("153");
  });

  it("renders all 5 month tick labels at frame 200+", () => {
    const markup = renderAt(260);
    expect(markup).toContain("Dec");
    expect(markup).toContain("Jan");
    expect(markup).toContain("Feb");
    expect(markup).toContain("Mar");
    expect(markup).toContain("Apr");
  });

  it("references all three sprint accent hex values after P4", () => {
    const markup = renderAt(400).toLowerCase();
    expect(markup).toContain("#1d4ed8"); // foundation accent (blue)
    expect(markup).toContain("#10b981"); // agentic accent (successGreenBright)
    expect(markup).toContain("#f59e0b"); // production accent (amberBright)
  });

  it("renders the '+420 commits · week of Apr 5' peak pill by frame 340", () => {
    const markup = renderAt(340);
    expect(markup).toContain("+420 commits");
    expect(markup).toContain("week of Apr 5");
  });

  it("renders the methodology strip after the hold begins", () => {
    const markup = renderAt(520);
    expect(markup).toContain("mined from git");
    expect(markup).toContain("61 active days");
  });

  it("renders the contributor footer after P7", () => {
    const markup = renderAt(400);
    expect(markup).toContain("Shree");
    expect(markup).toContain("Ayush");
  });
});
