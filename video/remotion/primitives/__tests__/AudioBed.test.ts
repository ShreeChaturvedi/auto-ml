import { describe, expect, it } from "vitest";
import { computeDuck } from "../AudioBed";

describe("computeDuck", () => {
  const duckDb = -12;
  const duckFactor = Math.pow(10, duckDb / 20); // ~0.2512

  it("returns 1 when there are no VO windows", () => {
    expect(computeDuck(100, undefined, duckDb)).toBe(1);
    expect(computeDuck(100, [], duckDb)).toBe(1);
  });

  it("returns 1 well outside any VO window", () => {
    expect(computeDuck(0, [{ start: 200, end: 300 }], duckDb)).toBe(1);
    expect(computeDuck(500, [{ start: 200, end: 300 }], duckDb)).toBe(1);
  });

  it("fully ducks inside the sustain portion of the window", () => {
    const attack = 12;
    // Well past the attack ramp, before window end.
    const mult = computeDuck(250, [{ start: 200, end: 300 }], duckDb, attack, 24);
    expect(mult).toBeCloseTo(duckFactor, 4);
  });

  it("ramps down during attack (VO start → start + attack)", () => {
    const attack = 12;
    // Midway through attack should be between 1 and duckFactor.
    const mid = computeDuck(206, [{ start: 200, end: 300 }], duckDb, attack, 24);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(duckFactor);
  });

  it("ramps back up during release (VO end → end + release)", () => {
    const release = 24;
    const mid = computeDuck(312, [{ start: 200, end: 300 }], duckDb, 12, release);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(duckFactor);
    expect(computeDuck(324, [{ start: 200, end: 300 }], duckDb, 12, release)).toBeCloseTo(1, 4);
  });

  it("at the window boundary (frame === start), multiplier is 1 (no duck yet)", () => {
    const mult = computeDuck(200, [{ start: 200, end: 300 }], duckDb, 12, 24);
    expect(mult).toBe(1);
  });
});
