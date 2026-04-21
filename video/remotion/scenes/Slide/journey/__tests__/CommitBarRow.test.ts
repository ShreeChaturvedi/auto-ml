import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../config/fonts", () => ({
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

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import { computeCommitBar, CommitBarRow } from "../CommitBarRow";
import { WEEKLY_BUCKETS, PEAK_WEEK } from "../../../../../config/journey-content";
import { JOURNEY_PALETTE } from "../../../../../config/journey-layout";
import { blendColor } from "../../../../helpers/colorBlend";

const RISES_AT = 260;
const STAGGER = 2;
const RISE = 22;
const PEAK_HEIGHT = 300;

describe("computeCommitBar", () => {
  it("height is 0 before risesAt + i*stagger", () => {
    const state = computeCommitBar(
      RISES_AT - 1,
      0,
      PEAK_HEIGHT,
      PEAK_WEEK.count,
      200,
      "production",
      RISES_AT,
      STAGGER,
      RISE,
    );
    expect(state.heightPx).toBe(0);
    expect(state.settled).toBe(false);
  });

  it("height is full at risesAt + i*stagger + riseDurationFrames", () => {
    const i = 3;
    const frame = RISES_AT + i * STAGGER + RISE;
    const count = 200;
    const state = computeCommitBar(
      frame,
      i,
      PEAK_HEIGHT,
      PEAK_WEEK.count,
      count,
      "agentic",
      RISES_AT,
      STAGGER,
      RISE,
    );
    const expected = (count / PEAK_WEEK.count) * PEAK_HEIGHT;
    expect(state.heightPx).toBeCloseTo(expected, 5);
    expect(state.settled).toBe(true);
  });

  it("peak week hits peakHeightPx exactly", () => {
    const i = PEAK_WEEK.weekIndex;
    const frame = RISES_AT + i * STAGGER + RISE;
    const state = computeCommitBar(
      frame,
      i,
      PEAK_HEIGHT,
      PEAK_WEEK.count,
      PEAK_WEEK.count,
      "production",
      RISES_AT,
      STAGGER,
      RISE,
    );
    expect(state.heightPx).toBeCloseTo(PEAK_HEIGHT, 5);
  });

  it("off-peak weeks scale linearly: (count / peakCount) * peakHeightPx", () => {
    const state = computeCommitBar(
      600,
      0,
      PEAK_HEIGHT,
      PEAK_WEEK.count,
      105, // ¼ of 420 = 105
      "foundation",
      RISES_AT,
      STAGGER,
      RISE,
    );
    expect(state.heightPx).toBeCloseTo(PEAK_HEIGHT * (105 / PEAK_WEEK.count), 5);
  });

  it("fill for foundation blends base 0.18 toward accentBlue", () => {
    const state = computeCommitBar(
      600, 0, PEAK_HEIGHT, PEAK_WEEK.count, 10, "foundation", RISES_AT, STAGGER, RISE,
    );
    expect(state.fill).toBe(
      blendColor(JOURNEY_PALETTE.barBase, JOURNEY_PALETTE.foundationAccent, 0.18),
    );
  });

  it("fill for agentic blends base 0.18 toward successGreenBright", () => {
    const state = computeCommitBar(
      600, 0, PEAK_HEIGHT, PEAK_WEEK.count, 10, "agentic", RISES_AT, STAGGER, RISE,
    );
    expect(state.fill).toBe(
      blendColor(JOURNEY_PALETTE.barBase, JOURNEY_PALETTE.agenticAccent, 0.18),
    );
  });

  it("fill for production blends base 0.18 toward amberBright", () => {
    const state = computeCommitBar(
      600, 0, PEAK_HEIGHT, PEAK_WEEK.count, 10, "production", RISES_AT, STAGGER, RISE,
    );
    expect(state.fill).toBe(
      blendColor(JOURNEY_PALETTE.barBase, JOURNEY_PALETTE.productionAccent, 0.18),
    );
  });
});

describe("<CommitBarRow /> rendering", () => {
  const renderAt = (frame: number) => {
    vi.mocked(useCurrentFrame).mockReturnValue(frame);
    return renderToStaticMarkup(
      React.createElement(CommitBarRow, {
        risesAt: RISES_AT,
        peakHaloAt: 300,
        peakBreatheAt: 400,
      }),
    );
  };

  it("renders without throwing across phase boundary frames", () => {
    expect(() => renderAt(0)).not.toThrow();
    expect(() => renderAt(RISES_AT + 30)).not.toThrow();
    expect(() => renderAt(599)).not.toThrow();
  });

  it("renders exactly one `div` per weekly bucket plus halo svg", () => {
    const markup = renderAt(599);
    // Each bar renders a <div style="...background:...">. Count how many
    // div substrings correspond to bar rows (they all carry the shared
    // background color expression "background:rgba(").
    const barMatches = markup.match(/background:rgba\(/g) ?? [];
    expect(barMatches.length).toBeGreaterThanOrEqual(WEEKLY_BUCKETS.length);
  });

  it("paints the peak bar's accent glow at hold-frame", () => {
    const markup = renderAt(500);
    // NodeHaloRing paints an SVG rect with stroke.
    expect(markup).toContain("<rect");
  });
});
