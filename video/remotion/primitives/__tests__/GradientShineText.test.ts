import { describe, expect, it, vi } from "vitest";

vi.mock("../../../config/fonts", () => ({
  REGULAR_FONT: {}, TITLE_FONT: {}, SERIF_FONT: { fontFamily: "serif" },
  MONOSPACE_FONT: {}, ENDCARD_FONT: {}, waitForFonts: async () => {},
}));

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return { ...actual, useCurrentFrame: vi.fn(() => 0) };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import {
  GradientShineText,
  type GradientShineTextProps,
} from "../GradientShineText";

const renderAt = (
  frame: number,
  props: Partial<GradientShineTextProps> = {},
) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(
    React.createElement(GradientShineText, {
      text: "Hi",
      fontSize: 48,
      ...props,
    }),
  );
};

describe("<GradientShineText />", () => {
  it("background-position is 0% at frame 0", () => {
    const markup = renderAt(0);
    expect(markup).toMatch(/background-position:\s*0%\s*0/);
  });

  it("background-position at frame periodFrames/4 is 75%", () => {
    const markup = renderAt(120, { periodFrames: 480 });
    expect(markup).toMatch(/background-position:\s*75%\s*0/);
  });

  it("background-position wraps to 0 at frame periodFrames", () => {
    const markup = renderAt(480, { periodFrames: 480 });
    expect(markup).toMatch(/background-position:\s*0%\s*0/);
  });

  it("deterministic: same frame yields same output", () => {
    const a = renderAt(100, { periodFrames: 480 });
    const b = renderAt(100, { periodFrames: 480 });
    expect(a).toBe(b);
  });

  it("uses serif font-family by default", () => {
    const markup = renderAt(0);
    expect(markup).toContain("serif");
  });
});
