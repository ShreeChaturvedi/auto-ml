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
    useVideoConfig: vi.fn(() => ({ fps: 60, width: 1920, height: 1080, durationInFrames: 420 })),
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
import { RetroSlideShell } from "../RetroSlideShell";
import { RETRO } from "../../../../config/reflection-content";

const renderConfig = (
  config: typeof RETRO.learned | typeof RETRO.wentWell | typeof RETRO.differently,
  frame: number,
) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(
    <RetroSlideShell theme="light" config={config} />,
  );
};

describe("<RetroSlideShell /> — LEARNED (blue, text-only)", () => {
  it("renders without throwing across phase-boundary frames", () => {
    for (const frame of [0, 60, 90, 240, 300, 419]) {
      expect(() => renderConfig(RETRO.learned, frame)).not.toThrow();
    }
  });

  it("renders the RETROSPECTIVE · 01 / 03 eyebrow + LEARNED title by frame 60", () => {
    const markup = renderConfig(RETRO.learned, 90);
    expect(markup).toContain("RETROSPECTIVE · 01 / 03");
    expect(markup).toContain("LEARNED");
  });

  it("renders all three statements by frame 240", () => {
    const markup = renderConfig(RETRO.learned, 240);
    // React escapes apostrophes as &#x27; in static markup — match literal.
    expect(markup).toContain("LangGraph&#x27;s explicit state machine");
    expect(markup).toContain("NL-to-SQL plateaus");
    expect(markup).toContain("Eval harnesses are");
  });

  it("references the blue tone stroke color in statement markup", () => {
    const markup = renderConfig(RETRO.learned, 320).toLowerCase();
    expect(markup).toContain("#1d4ed8");
  });

  it("renders no GraphNode/ToolCallCard markup for the text-only variant", () => {
    const markup = renderConfig(RETRO.learned, 400);
    // ToolCallCard renders the title text 'graph.create(' — absent here.
    expect(markup).not.toContain("graph.create(");
  });
});

describe("<RetroSlideShell /> — WENT WELL (green, graph anchor)", () => {
  it("renders without throwing across phase-boundary frames", () => {
    for (const frame of [0, 60, 90, 240, 300, 419]) {
      expect(() => renderConfig(RETRO.wentWell, frame)).not.toThrow();
    }
  });

  it("renders the WHAT WENT WELL title + eyebrow by frame 90", () => {
    const markup = renderConfig(RETRO.wentWell, 90);
    expect(markup).toContain("WHAT WENT WELL");
    expect(markup).toContain("RETROSPECTIVE · 02 / 03");
  });

  it("renders all three graph-node labels (propose, tool_call, validate)", () => {
    const markup = renderConfig(RETRO.wentWell, 300);
    expect(markup).toContain("propose");
    expect(markup).toContain("tool_call");
    expect(markup).toContain("validate");
  });

  it("references the green tone stroke color in statement markup", () => {
    const markup = renderConfig(RETRO.wentWell, 320).toLowerCase();
    expect(markup).toContain("#10b981");
  });
});

describe("<RetroSlideShell /> — DIFFERENTLY (amber, ToolCallCard anchor)", () => {
  it("renders without throwing across phase-boundary frames", () => {
    for (const frame of [0, 60, 90, 240, 300, 419]) {
      expect(() => renderConfig(RETRO.differently, frame)).not.toThrow();
    }
  });

  it("renders the WHAT WE'D DO DIFFERENTLY title + eyebrow by frame 90", () => {
    const markup = renderConfig(RETRO.differently, 90);
    expect(markup).toContain("WHAT WE&#x27;D DO DIFFERENTLY");
    expect(markup).toContain("RETROSPECTIVE · 03 / 03");
  });

  it("renders the ToolCallCard header 'graph.create(' by frame 240", () => {
    const markup = renderConfig(RETRO.differently, 280);
    expect(markup).toContain("graph.create(");
  });

  it("references the amber tone stroke color in statement markup", () => {
    const markup = renderConfig(RETRO.differently, 320).toLowerCase();
    expect(markup).toContain("#f59e0b");
  });

  it("renders both statement bodies", () => {
    const markup = renderConfig(RETRO.differently, 300);
    expect(markup).toContain("We&#x27;d start with LangGraph");
    expect(markup).toContain("end-to-end MVP shell");
  });
});
