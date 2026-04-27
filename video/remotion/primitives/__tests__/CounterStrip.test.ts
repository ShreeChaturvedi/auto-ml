import { describe, expect, it, vi } from "vitest";

vi.mock("../../../config/fonts", () => ({
  REGULAR_FONT: {},
  TITLE_FONT: {},
  SERIF_FONT: {},
  MONOSPACE_FONT: { fontFamily: "monospace" },
  ENDCARD_FONT: {},
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
import { CounterStrip, type CounterStripProps } from "../CounterStrip";

const cells = [
  { label: "workflow_runs", to: 1247 },
  { label: "workflow_events", to: 18403 },
  { label: "workflow_artifacts", to: 89 },
];

const base: CounterStripProps = { cells, x: 100, y: 200 };

const renderAt = (frame: number, props: CounterStripProps = base) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(React.createElement(CounterStrip, props));
};

describe("<CounterStrip /> rendering", () => {
  it("paints every cell's label", () => {
    const markup = renderAt(200);
    expect(markup).toContain("workflow_runs");
    expect(markup).toContain("workflow_events");
    expect(markup).toContain("workflow_artifacts");
  });

  it("shows the final count value once count-up completes", () => {
    const markup = renderAt(600);
    expect(markup).toContain("1,247");
    expect(markup).toContain("18,403");
  });

  it("count is 0 before the count-up begins (first card)", () => {
    const markup = renderAt(10);
    expect(markup).toContain("0");
  });
});
