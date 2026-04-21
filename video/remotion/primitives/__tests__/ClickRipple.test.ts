import { describe, expect, it } from "vitest";
import { computeClickRipple } from "../ClickRipple";

describe("computeClickRipple", () => {
  const AT = 100;
  const MAX = 48;

  it("is invisible before click frame", () => {
    expect(computeClickRipple(99, AT, MAX).visible).toBe(false);
  });

  it("expands radius 0 → max over first 12 frames", () => {
    expect(computeClickRipple(AT, AT, MAX).radius).toBe(0);
    expect(computeClickRipple(AT + 6, AT, MAX).radius).toBe(24);
    expect(computeClickRipple(AT + 12, AT, MAX).radius).toBe(48);
  });

  it("ramps opacity 0 → 0.4 during expand, then 0.4 → 0 during fade", () => {
    expect(computeClickRipple(AT, AT, MAX).opacity).toBe(0);
    expect(computeClickRipple(AT + 12, AT, MAX).opacity).toBeCloseTo(0.4, 5);
    expect(computeClickRipple(AT + 15, AT, MAX).opacity).toBeCloseTo(0.2, 5);
    expect(computeClickRipple(AT + 18, AT, MAX).opacity).toBeCloseTo(0, 5);
  });

  it("holds radius at max during the fade phase", () => {
    expect(computeClickRipple(AT + 15, AT, MAX).radius).toBe(MAX);
    expect(computeClickRipple(AT + 18, AT, MAX).radius).toBe(MAX);
  });

  it("is invisible after total duration (18 frames)", () => {
    expect(computeClickRipple(AT + 19, AT, MAX).visible).toBe(false);
  });
});
