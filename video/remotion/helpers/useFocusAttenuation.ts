import { interpolate, useCurrentFrame } from "remotion";

/**
 * Returns an opacity multiplier that dims a region when focus has moved
 * elsewhere. Before `focusStart`, returns 1 (fully lit). From `focusStart`
 * over `rampFrames`, ramps down to `dimTo`.
 */
export const useFocusAttenuation = (
  focusStart: number,
  rampFrames: number = 24,
  dimTo: number = 0.35,
): number => {
  const frame = useCurrentFrame();
  return interpolate(frame, [focusStart, focusStart + rampFrames], [1, dimTo], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};
