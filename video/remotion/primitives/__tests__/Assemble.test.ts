import { describe, expect, it } from "vitest";
import { computeAssembleTransform } from "../Assemble";

describe("computeAssembleTransform", () => {
  it("bottom: starts translateY(24) at progress 0, settles translateY(0) at 1", () => {
    expect(computeAssembleTransform("bottom", 0)).toEqual({
      transform: "translateY(24px)",
      opacity: 0,
    });
    expect(computeAssembleTransform("bottom", 1)).toEqual({
      transform: "translateY(0px)",
      opacity: 1,
    });
  });

  it("top: mirrors bottom with negative Y", () => {
    expect(computeAssembleTransform("top", 0).transform).toBe("translateY(-24px)");
    expect(computeAssembleTransform("top", 1).transform).toBe("translateY(0px)");
  });

  it("left / right: use X axis", () => {
    expect(computeAssembleTransform("left", 0).transform).toBe("translateX(-24px)");
    expect(computeAssembleTransform("right", 0).transform).toBe("translateX(24px)");
  });

  it("scale: 0.92 → 1.0 across progress 0..1", () => {
    expect(computeAssembleTransform("scale", 0).transform).toBe("scale(0.92)");
    expect(computeAssembleTransform("scale", 1).transform).toBe("scale(1)");
  });

  it("center / morph: opacity only, no transform", () => {
    expect(computeAssembleTransform("center", 0.5).transform).toBe("none");
    expect(computeAssembleTransform("morph", 0.5).transform).toBe("none");
  });

  it("clamps progress outside 0..1", () => {
    expect(computeAssembleTransform("bottom", -0.5).opacity).toBe(0);
    expect(computeAssembleTransform("bottom", 1.5).opacity).toBe(1);
  });
});
