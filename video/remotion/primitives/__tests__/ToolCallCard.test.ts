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
import { ToolCallCard, type ToolCallCardProps } from "../ToolCallCard";

const base: ToolCallCardProps = {
  x: 100,
  y: 200,
  w: 400,
  icon: "wrench",
  title: "configure_experiment",
  enterFrame: 0,
};

const renderAt = (frame: number, props: ToolCallCardProps = base) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(React.createElement(ToolCallCard, props));
};

describe("<ToolCallCard /> rendering", () => {
  it("starts with opacity 0 at enterFrame", () => {
    const markup = renderAt(0, base);
    expect(markup).toMatch(/opacity:0[;"]/);
  });

  it("fades in to opacity 1 well after enterFrame", () => {
    const markup = renderAt(60, base);
    expect(markup).toMatch(/opacity:1[;"]/);
  });

  it("renders the title", () => {
    const markup = renderAt(60, base);
    expect(markup).toContain("configure_experiment");
  });

  it("renders subtitle when provided", () => {
    const markup = renderAt(60, { ...base, subtitle: "creditcard.csv" });
    expect(markup).toContain("creditcard.csv");
  });

  it("uses the shadcn/ui card background (#FAFAFA from --card 0 0% 98%)", () => {
    const markup = renderAt(60, base).toLowerCase();
    expect(markup).toContain("#fafafa");
  });

  it("uses the shadcn/ui border color (#E5E5E5 from --border 0 0% 90%)", () => {
    const markup = renderAt(60, base).toLowerCase();
    expect(markup).toContain("#e5e5e5");
  });

  it("renders body copy in the shadcn/ui foreground color (#171717)", () => {
    const markup = renderAt(60, { ...base, body: { kind: "text", lines: ["x"] } }).toLowerCase();
    expect(markup).toContain("#171717");
  });

  it("omits pill when no status and no statusTimeline", () => {
    const markup = renderAt(60, base).toLowerCase();
    // No tone bgs should appear
    expect(markup).not.toContain("#dcfce7");
    expect(markup).not.toContain("#dbeafe");
  });

  it("shows running pill (blue-100 bg, blue-800 text) when status=running", () => {
    const markup = renderAt(60, { ...base, status: "running" }).toLowerCase();
    expect(markup).toContain("#1e40af");
    expect(markup).toContain("#dbeafe");
  });

  it("shows success pill (green-100 bg, green-800 text) when status=success", () => {
    const markup = renderAt(60, { ...base, status: "success" }).toLowerCase();
    expect(markup).toContain("#166534");
    expect(markup).toContain("#dcfce7");
  });

  it("statusTimeline advances over time", () => {
    const tl: ToolCallCardProps = {
      ...base,
      statusTimeline: [
        { atFrame: 0, status: "running" },
        { atFrame: 100, status: "success" },
      ],
    };
    expect(renderAt(60, tl).toLowerCase()).toContain("#1e40af"); // running text
    expect(renderAt(200, tl).toLowerCase()).toContain("#166534"); // success text
  });

  it("focusOpacity multiplies into final opacity", () => {
    const markup = renderAt(60, { ...base, focusOpacity: 0.35 });
    expect(markup).toMatch(/opacity:0\.35[;"]/);
  });

  it("body kind=code uses monospace", () => {
    const markup = renderAt(60, { ...base, body: { kind: "code", lines: ["a: 1"] } });
    expect(markup).toContain("a: 1");
    expect(markup).toContain("monospace");
  });

  it("body kind=text lists each line", () => {
    const markup = renderAt(60, {
      ...base,
      body: { kind: "text", lines: ["x", "y", "z"] },
    });
    expect(markup).toContain("x");
    expect(markup).toContain("y");
    expect(markup).toContain("z");
  });

  it("no body means no separator row", () => {
    const markup = renderAt(60, base);
    // The separator uses `border-top` in the body container; without body it
    // must not appear. The container's card border uses the `border` shorthand,
    // which React serializes as `border:` (no `-top`) in SSR.
    expect(markup).not.toContain("border-top");
  });
});
