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
    useCurrentFrame: vi.fn(() => 60),
    useVideoConfig: vi.fn(() => ({ fps: 60, width: 1920, height: 1080, durationInFrames: 3600 })),
  };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TechIcon } from "../TechIcon";

describe("<TechIcon /> custom assets", () => {
  it.each([
    { asset: "openai" as const, expectedTitle: "OpenAI" },
    { asset: "gemini" as const, expectedTitle: "Gemini" },
    { asset: "cursor" as const, expectedTitle: "Cursor" },
  ])("renders $asset with aria-label $expectedTitle and currentColor markup", ({ asset, expectedTitle }) => {
    const markup = renderToStaticMarkup(
      React.createElement(TechIcon, { name: "custom", asset, size: 48 }),
    );
    expect(markup).toContain(`aria-label="${expectedTitle}"`);
    expect(markup).toContain(`<title>${expectedTitle}</title>`);
    expect(markup).toContain("currentColor");
  });

  it("renders brand icons from simple-icons when name is a brand slug", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TechIcon, { name: "react", size: 24 }),
    );
    expect(markup).toContain("<title>React</title>");
  });

  it("renders a chip fallback with the supplied uppercase label", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TechIcon, { name: "chip", label: "MCP", size: 24 }),
    );
    expect(markup).toContain("MCP");
  });
});
