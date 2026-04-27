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
import { StatusPill, type StatusKind, type StatusPillProps } from "../StatusPill";

const ALL_KINDS: StatusKind[] = [
  "accepted",
  "success",
  "rejected",
  "failed",
  "running",
  "pending",
  "awaiting",
  "selected",
  "skipped",
  "warning",
  "info",
  "neutral",
];

const renderAt = (frame: number, props: StatusPillProps) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(React.createElement(StatusPill, props));
};

describe("<StatusPill /> rendering", () => {
  it.each(ALL_KINDS)("renders without error for kind=%s", (kind) => {
    expect(() => renderAt(0, { kind })).not.toThrow();
  });

  it("renders explicit label text when provided", () => {
    const markup = renderAt(0, { kind: "success", label: "done" });
    expect(markup).toContain("done");
  });

  it("uses default label when label prop omitted", () => {
    const markup = renderAt(0, { kind: "running" });
    expect(markup).toContain("running");
  });

  it("omits the label text when label is an empty string", () => {
    const markup = renderAt(0, { kind: "success", label: "" });
    expect(markup).not.toContain("success");
  });

  it("renders icon by default (check-circle for success)", () => {
    const markup = renderAt(0, { kind: "success" });
    expect(markup).toContain("<svg");
  });

  it("omits the icon svg when showIcon=false", () => {
    const markup = renderAt(0, { kind: "success", showIcon: false });
    expect(markup).not.toContain("<svg");
  });

  it("rotates the loader 0deg at frame=0 for kind=running", () => {
    const markup = renderAt(0, { kind: "running" });
    expect(markup).toContain("rotate(0deg)");
  });

  it("rotates the loader 180deg at frame=30 for kind=running", () => {
    // 30 frames × 6°/frame = 180°
    const markup = renderAt(30, { kind: "running" });
    expect(markup).toContain("rotate(180deg)");
  });

  it("does not apply rotation transform when kind is not running", () => {
    const markup = renderAt(30, { kind: "success" });
    expect(markup).not.toContain("rotate(");
  });

  it("success tone uses the green-800 text / green-100 bg palette", () => {
    const markup = renderAt(0, { kind: "success" }).toLowerCase();
    // Tailwind green-800 text on green-100 bg with green-200 border
    expect(markup).toContain("#166534");
    expect(markup).toContain("#dcfce7");
    expect(markup).toContain("#bbf7d0");
  });

  it("failed tone uses the red-800 text / red-100 bg palette", () => {
    const markup = renderAt(0, { kind: "failed" }).toLowerCase();
    expect(markup).toContain("#991b1b");
    expect(markup).toContain("#fee2e2");
    expect(markup).toContain("#fecaca");
  });

  it("running tone uses the blue-800 text / blue-100 bg palette", () => {
    const markup = renderAt(0, { kind: "running" }).toLowerCase();
    expect(markup).toContain("#1e40af");
    expect(markup).toContain("#dbeafe");
    expect(markup).toContain("#bfdbfe");
  });

  it("pending tone uses the amber-800 text / amber-100 bg palette", () => {
    const markup = renderAt(0, { kind: "pending" }).toLowerCase();
    expect(markup).toContain("#92400e");
    expect(markup).toContain("#fef3c7");
    expect(markup).toContain("#fde68a");
  });

  it("neutral tone uses the neutral-600 text / neutral-100 bg palette", () => {
    const markup = renderAt(0, { kind: "neutral" }).toLowerCase();
    expect(markup).toContain("#525252");
    expect(markup).toContain("#f5f5f5");
    expect(markup).toContain("#e5e5e5");
  });
});
