import { describe, expect, it } from "vitest";
import { computeAddressBarTyper } from "../AddressBarTyper";

describe("computeAddressBarTyper", () => {
  const URL = "agentic-automl.vercel.app";
  const RATE = 3;

  // New pacing: typing starts at f=120, ends at f=195, commit at f=210
  const START = 120;
  const TYPE_END = START + URL.length * RATE; // 195
  const COMMIT = TYPE_END + 15; // 210
  const COMMIT_DUR = 15;

  const compute = (frame: number) =>
    computeAddressBarTyper(frame, URL, START, RATE, COMMIT, COMMIT_DUR);

  it("reveals no chars before startFrame", () => {
    expect(compute(0).typed).toBe("");
    expect(compute(START - 1).typed).toBe("");
    // Exactly at startFrame, zero chars revealed — the first char lands
    // after one full `rate` interval, not immediately.
    expect(compute(START).typed).toBe("");
  });

  it("reveals one char per `rate` frames", () => {
    expect(compute(START + RATE).typed).toBe("a");
    expect(compute(START + RATE * 2).typed).toBe("ag");
    expect(compute(START + RATE * 3).typed).toBe("age");
    expect(compute(START + RATE * 7).typed).toBe("agentic");
  });

  it("clamps typed at url length once typing completes", () => {
    expect(compute(TYPE_END).typed).toBe(URL);
    // Past the end — still full URL, never overruns.
    expect(compute(TYPE_END + 60).typed).toBe(URL);
  });

  it("blinks caret before typing starts (50% duty cycle, 30-frame period)", () => {
    // Caret visible in the first half of each 30-frame period (`frame % 30 < 15`).
    // frame 60 → 60 % 30 = 0  → visible (before typing starts at 120).
    expect(compute(60).caretVisible).toBe(true);
    // frame 74 → 74 % 30 = 14 → visible.
    expect(compute(74).caretVisible).toBe(true);
    // frame 75 → 75 % 30 = 15 → hidden (off half of blink period).
    expect(compute(75).caretVisible).toBe(false);
    // frame 89 → 89 % 30 = 29 → hidden.
    expect(compute(89).caretVisible).toBe(false);
  });

  it("hides caret during typing", () => {
    // Mid-typing frames — caret should always be hidden.
    expect(compute(START + 1).caretVisible).toBe(false);
    expect(compute(START + RATE * 5).caretVisible).toBe(false);
    expect(compute(TYPE_END - 1).caretVisible).toBe(false);
  });

  it("blinks caret after typing completes but before commit", () => {
    // f=195 → 195 % 30 = 15 → off half → hidden.
    expect(compute(TYPE_END).caretVisible).toBe(false);
    // f=210 is commit frame so caret hidden from commit onward — test
    // the window between TYPE_END and COMMIT.
    // f=200 → 200 % 30 = 20 → off half → hidden.
    expect(compute(200).caretVisible).toBe(false);
    // f=210 = COMMIT → hidden.
    expect(compute(COMMIT).caretVisible).toBe(false);
  });

  it("hides caret after commit frame", () => {
    expect(compute(COMMIT).caretVisible).toBe(false);
    expect(compute(COMMIT + 100).caretVisible).toBe(false);
  });

  it("pops scale 1 → 1.03 → 1 within commit window", () => {
    expect(compute(COMMIT - 1).popScale).toBe(1);
    expect(compute(COMMIT).popScale).toBe(1);
    // Midpoint of commit flash = peak scale.
    expect(compute(COMMIT + COMMIT_DUR / 2).popScale).toBeCloseTo(1.03, 5);
    // End of commit flash — back to 1.
    expect(compute(COMMIT + COMMIT_DUR).popScale).toBeCloseTo(1, 5);
    // Past commit — steady at 1.
    expect(compute(COMMIT + COMMIT_DUR + 10).popScale).toBe(1);
  });

  it("handles zero-length url safely", () => {
    const state = computeAddressBarTyper(50, "", START, RATE, COMMIT, COMMIT_DUR);
    expect(state.typed).toBe("");
    expect(state.popScale).toBe(1);
  });
});
