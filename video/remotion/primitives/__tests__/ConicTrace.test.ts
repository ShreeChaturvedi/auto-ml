import { describe, expect, it } from "vitest";
import { roundedRectPerimeter } from "../ConicTrace";

describe("roundedRectPerimeter", () => {
  it("reduces to 2*(w+h) when radius is 0 (plain rect)", () => {
    expect(roundedRectPerimeter(100, 50, 0)).toBeCloseTo(300, 5);
  });

  it("equals the circle circumference when w = h = 2r (filled circle case)", () => {
    // 2*(2r + 2r) - 8r + 2πr = 8r - 8r + 2πr = 2πr — a circle of radius r.
    expect(roundedRectPerimeter(20, 20, 10)).toBeCloseTo(2 * Math.PI * 10, 5);
  });

  it("pill case (r = h/2): straight sides + two semicircles", () => {
    // w=200, h=40, r=20
    // Expected: 2 straight segments of length (w - 2r) + circumference 2πr
    // = 2*(200 - 40) + 2π*20 = 320 + 40π ≈ 445.664
    expect(roundedRectPerimeter(200, 40, 20)).toBeCloseTo(320 + 2 * Math.PI * 20, 5);
  });

  it("is monotonically increasing in w and h for fixed r", () => {
    const a = roundedRectPerimeter(100, 50, 8);
    const b = roundedRectPerimeter(120, 50, 8);
    const c = roundedRectPerimeter(120, 70, 8);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
