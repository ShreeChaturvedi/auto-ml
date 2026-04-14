import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

type FadeInOptions = {
  /** Spring damping — higher = less bouncy. Default 200. */
  damping?: number;
  /** Vertical travel (px) from before the fade to the settled position. Default 0. */
  translateY?: number;
  /** Delay in frames before the spring starts. Default 0. */
  delay?: number;
  /** Spring duration in frames. Optional — if omitted, Remotion picks. */
  durationInFrames?: number;
};

/**
 * "Editorial fade-in" hook used across slides, titles, and the end card.
 *
 * Returns:
 *   - `progress` 0→1 so callers can drive whatever they want
 *   - `opacity` already interpolated 0→1 from `progress`
 *   - `translateY` already interpolated `options.translateY → 0`
 *   - `transform` pre-formatted CSS transform string
 */
export const useFadeIn = ({
  damping = 200,
  translateY = 0,
  delay = 0,
  durationInFrames,
}: FadeInOptions = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    fps,
    frame,
    config: { damping },
    delay,
    durationInFrames,
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const y = interpolate(progress, [0, 1], [translateY, 0]);
  const transform = translateY === 0 ? undefined : `translateY(${y}px)`;

  return { progress, opacity, translateY: y, transform };
};
