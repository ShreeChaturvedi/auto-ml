import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type StaggerOptions = {
  /** Frames between each item's delay. Default 15 — matches app `card-enter` 250ms @60fps. */
  step?: number;
  /** Frames to wait before the first item starts. Default 0. */
  startDelay?: number;
  /** Shared translateY distance (px) from pre-fade to settled position. Default 16. */
  translateY?: number;
  /** Spring damping — higher = less bouncy. Default 200 (SPRING_UI.damping). */
  damping?: number;
  /** Optional spring duration override in frames. */
  durationInFrames?: number;
};

export type StaggeredItem = {
  /** Raw spring progress 0→1 for this item. */
  progress: number;
  /** Interpolated opacity 0→1. */
  opacity: number;
  /** Current translateY in px (animates from `translateY` to 0). */
  translateY: number;
  /** Pre-formatted CSS transform string. */
  transform: string;
};

/**
 * Stagger helper that emits a fixed-length array of fade-in states, one per
 * item, offset by `step` frames each.
 *
 * IMPORTANT: `count` MUST be stable across renders (React hook rules). In
 * practice, slides know their item count up front (3 cards, 7 chapter rows,
 * etc.) — pass a constant.
 *
 * Default step (15 frames) mirrors the app's `card-enter` 250ms rhythm.
 */
export const useStaggeredFadeIn = (
  count: number,
  opts: StaggerOptions = {},
): StaggeredItem[] => {
  const {
    step = 15,
    startDelay = 0,
    translateY = 16,
    damping = 200,
    durationInFrames,
  } = opts;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const items: StaggeredItem[] = [];
  for (let i = 0; i < count; i += 1) {
    const delay = startDelay + i * step;
    const progress = spring({
      fps,
      frame,
      config: { damping },
      delay,
      durationInFrames,
    });
    const opacity = interpolate(progress, [0, 1], [0, 1]);
    const y = interpolate(progress, [0, 1], [translateY, 0]);
    items.push({
      progress,
      opacity,
      translateY: y,
      transform: `translateY(${y}px)`,
    });
  }
  return items;
};
