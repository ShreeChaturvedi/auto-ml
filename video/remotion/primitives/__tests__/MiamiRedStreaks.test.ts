import { describe, expect, it } from "vitest";
import { computeStreak, DEFAULT_STREAKS } from "../MiamiRedStreaks";

const W = 1920;
const H = 1080;

describe("computeStreak", () => {
  it("returns null before spawnFrame", () => {
    const streak = {
      spawnFrame: 50,
      angleDeg: 0,
      speed: 10,
      anchor: { x: 100, y: 100 },
    };
    expect(computeStreak(0, streak, W, H)).toBeNull();
    expect(computeStreak(49, streak, W, H)).toBeNull();
  });

  it("starts at anchor at spawnFrame with opacity 0 (fade-in begins)", () => {
    const streak = {
      spawnFrame: 15,
      angleDeg: 135,
      speed: 11,
      anchor: { x: 1500, y: 0 },
    };
    const s = computeStreak(15, streak, W, H);
    expect(s).not.toBeNull();
    expect(s!.x).toBeCloseTo(1500, 5);
    expect(s!.y).toBeCloseTo(0, 5);
    expect(s!.opacity).toBe(0);
  });

  it("reaches full opacity after 4-frame fade-in", () => {
    const streak = {
      spawnFrame: 0,
      angleDeg: 0,
      speed: 0,
      anchor: { x: 500, y: 500 },
    };
    expect(computeStreak(0, streak, W, H)?.opacity).toBe(0);
    expect(computeStreak(2, streak, W, H)?.opacity).toBe(0.5);
    expect(computeStreak(4, streak, W, H)?.opacity).toBe(1);
    expect(computeStreak(100, streak, W, H)?.opacity).toBe(1);
  });

  it("moves linearly by angle and speed per frame", () => {
    // angle 0° = right (dx=1, dy=0). At age 10, speed 10 → travel 100.
    const streak = {
      spawnFrame: 0,
      angleDeg: 0,
      speed: 10,
      anchor: { x: 0, y: 500 },
    };
    const s = computeStreak(10, streak, W, H);
    expect(s!.x).toBeCloseTo(100, 5);
    expect(s!.y).toBeCloseTo(500, 5);
  });

  it("grows scaleX with travel distance (1 + travel/100)", () => {
    const streak = {
      spawnFrame: 0,
      angleDeg: 0,
      speed: 10,
      anchor: { x: 0, y: 500 },
    };
    expect(computeStreak(0, streak, W, H)?.scaleX).toBe(1);
    expect(computeStreak(10, streak, W, H)?.scaleX).toBeCloseTo(2, 5);
    expect(computeStreak(20, streak, W, H)?.scaleX).toBeCloseTo(3, 5);
  });

  it("returns null once position exits canvas by more than margin (20px)", () => {
    const streak = {
      spawnFrame: 0,
      angleDeg: 0,
      speed: 100,
      anchor: { x: 0, y: 500 },
    };
    // At age 19, x=1900 — still within canvas+margin (1940).
    expect(computeStreak(19, streak, W, H)).not.toBeNull();
    // At age 20, x=2000 — beyond canvas+margin. Culled.
    expect(computeStreak(20, streak, W, H)).toBeNull();
  });

  it("passes the angle through unchanged for rendering", () => {
    const streak = {
      spawnFrame: 0,
      angleDeg: 225,
      speed: 10,
      anchor: { x: 500, y: 500 },
    };
    expect(computeStreak(5, streak, W, H)?.angleDeg).toBe(225);
  });
});

describe("DEFAULT_STREAKS choreography", () => {
  const activeCount = (frame: number): number =>
    DEFAULT_STREAKS.filter((s) => computeStreak(frame, s, W, H) !== null).length;

  it("exactly five streaks scheduled", () => {
    expect(DEFAULT_STREAKS).toHaveLength(5);
  });

  it("first streak spawns at frame 15 — earlier frames are silent", () => {
    expect(activeCount(0)).toBe(0);
    expect(activeCount(14)).toBe(0);
    expect(activeCount(15)).toBe(1);
  });

  it("no streak spawns after frame 160", () => {
    const laterSpawns = DEFAULT_STREAKS.filter((s) => s.spawnFrame > 160);
    expect(laterSpawns).toHaveLength(0);
  });

  it("at least one streak visible between frames 20 and 240", () => {
    for (let frame = 20; frame <= 240; frame += 20) {
      expect(activeCount(frame)).toBeGreaterThan(0);
    }
  });

  it("all streaks gone by frame 270 — clean hold through frame 540", () => {
    for (let frame = 270; frame <= 540; frame += 30) {
      expect(activeCount(frame)).toBe(0);
    }
  });

  it("frame 540 (end of title scene) has zero active streaks", () => {
    expect(activeCount(540)).toBe(0);
  });
});
