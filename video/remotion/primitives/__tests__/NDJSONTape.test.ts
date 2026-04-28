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
  return { ...actual, useCurrentFrame: vi.fn(() => 0) };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import {
  computeVisiblePills,
  NDJSONTape,
  type NDJSONPill,
  type NDJSONTapeProps,
} from "../NDJSONTape";

const pills: NDJSONPill[] = [
  { id: "a", label: "state_update", enterFrame: 0 },
  { id: "b", label: "tool_execution", enterFrame: 30 },
  { id: "c", label: "done", enterFrame: 60 },
];

describe("computeVisiblePills", () => {
  it("returns empty list before the first pill's enterFrame", () => {
    const v = computeVisiblePills(-1, pills, { width: 600 });
    expect(v).toHaveLength(0);
  });

  it("emits the first pill once its enterFrame passes", () => {
    const v = computeVisiblePills(0, pills, { width: 600 });
    expect(v).toHaveLength(1);
    expect(v[0]!.pill.id).toBe("a");
  });

  it("emits all pills once all enterFrames have passed", () => {
    const v = computeVisiblePills(200, pills, { width: 600 });
    expect(v.map((p) => p.pill.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("pill opacity fades in across PILL_FADE_FRAMES (12)", () => {
    const v0 = computeVisiblePills(0, pills, { width: 600 });
    const v6 = computeVisiblePills(6, pills, { width: 600 });
    const v12 = computeVisiblePills(12, pills, { width: 600 });
    expect(v0[0]!.opacity).toBe(0);
    expect(v6[0]!.opacity).toBeGreaterThan(0);
    expect(v6[0]!.opacity).toBeLessThan(1);
    expect(v12[0]!.opacity).toBe(1);
  });

  it("older pills scroll left as newer pills land", () => {
    const veryEarly = computeVisiblePills(0, pills, {
      width: 600,
      holdFrames: 60,
      scrollDurationFrames: 30,
    });
    // Fast-forward past pill B's scroll activation
    const afterB = computeVisiblePills(120, pills, {
      width: 600,
      holdFrames: 60,
      scrollDurationFrames: 30,
    });
    const aEarlyX = veryEarly[0]!.x;
    const aLaterX = afterB.find((v) => v.pill.id === "a")!.x;
    expect(aLaterX).toBeLessThan(aEarlyX);
  });
});

describe("<NDJSONTape /> rendering", () => {
  const props: NDJSONTapeProps = { pills, width: 600 };

  it("renders no pill children before any enterFrame passes", () => {
    vi.mocked(useCurrentFrame).mockReturnValue(-5);
    const markup = renderToStaticMarkup(
      React.createElement(NDJSONTape, props),
    );
    expect(markup).not.toContain("state_update");
  });

  it("renders the pill's label text once visible", () => {
    vi.mocked(useCurrentFrame).mockReturnValue(24);
    const markup = renderToStaticMarkup(
      React.createElement(NDJSONTape, props),
    );
    expect(markup).toContain("state_update");
  });
});
