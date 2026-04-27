import { describe, expect, it, vi } from "vitest";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return { ...actual, useCurrentFrame: vi.fn(() => 0) };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import { useFocusAttenuation } from "../useFocusAttenuation";

/**
 * Calls the hook inside a dummy component and returns the computed value.
 * We write it to a data attribute so it's retrievable from server-rendered
 * markup — simpler than bringing in @testing-library/react just to probe
 * a single return value.
 */
const callHook = (
  focusStart: number,
  rampFrames?: number,
  dimTo?: number,
): number => {
  const Probe: React.FC = () => {
    const v = useFocusAttenuation(focusStart, rampFrames, dimTo);
    return React.createElement("div", { "data-v": v });
  };
  const markup = renderToStaticMarkup(React.createElement(Probe));
  const m = markup.match(/data-v="([^"]+)"/);
  if (!m) throw new Error(`no data-v in markup: ${markup}`);
  return Number(m[1]);
};

const mockFrame = (f: number) => {
  vi.mocked(useCurrentFrame).mockReturnValue(f);
};

describe("useFocusAttenuation", () => {
  it("returns 1.0 before focusStart (fully lit)", () => {
    mockFrame(0);
    expect(callHook(60, 24, 0.35)).toBe(1);
  });

  it("returns 1.0 exactly at focusStart (ramp has not yet moved)", () => {
    mockFrame(60);
    expect(callHook(60, 24, 0.35)).toBe(1);
  });

  it("returns roughly (1 + dimTo)/2 at the ramp midpoint", () => {
    mockFrame(72); // 60 + 24/2
    expect(callHook(60, 24, 0.35)).toBeCloseTo((1 + 0.35) / 2, 5);
  });

  it("returns dimTo at focusStart + rampFrames", () => {
    mockFrame(84); // 60 + 24
    expect(callHook(60, 24, 0.35)).toBeCloseTo(0.35, 5);
  });

  it("clamps to dimTo after the ramp completes (extrapolateRight: clamp)", () => {
    mockFrame(200);
    expect(callHook(60, 24, 0.35)).toBeCloseTo(0.35, 5);
  });

  it("honors custom rampFrames and dimTo", () => {
    mockFrame(100); // midpoint of [90, 110]
    expect(callHook(90, 20, 0.5)).toBeCloseTo((1 + 0.5) / 2, 5);
  });

  it("uses defaults rampFrames=24 dimTo=0.35 when omitted", () => {
    mockFrame(72); // 60 + 12
    expect(callHook(60)).toBeCloseTo((1 + 0.35) / 2, 5);
  });
});
