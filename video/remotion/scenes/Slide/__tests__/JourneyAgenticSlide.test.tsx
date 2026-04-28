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
import { JourneyAgenticSlide } from "../JourneyAgenticSlide";

const renderAt = (frame: number) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(<JourneyAgenticSlide theme="light" meta={undefined} />);
};

describe("<JourneyAgenticSlide />", () => {
  it("renders without throwing across phase-boundary frames", () => {
    for (const frame of [0, 30, 90, 130, 220, 310, 390, 479]) {
      expect(() => renderAt(frame)).not.toThrow();
    }
  });

  it("renders the SPRINTS 5-8 · THE AGENTIC TURN active header cell at frame 30+", () => {
    const markup = renderAt(60);
    expect(markup).toContain("SPRINTS 5-8");
    expect(markup).toContain("THE AGENTIC TURN");
  });

  it("renders the LangGraph serif hero line at frame 90+", () => {
    const markup = renderAt(140);
    expect(markup).toContain("LangGraph state machine");
  });

  it("renders all 3 milestone labels at frame 390+", () => {
    const markup = renderAt(410);
    expect(markup).toContain("LangGraph preprocessing FSM");
    expect(markup).toContain("Jupyter kernel replaces Python wrapper");
    expect(markup).toContain("OpenAI migration");
  });

  it("renders the 55 / 324 issues labelled pill at the hero moment", () => {
    const markup = renderAt(450);
    expect(markup).toContain("55 / 324 issues labelled");
  });

  it("references agentic accent successGreenBright in markup at hero moment", () => {
    const markup = renderAt(450).toLowerCase();
    expect(markup).toContain("#10b981");
  });
});
