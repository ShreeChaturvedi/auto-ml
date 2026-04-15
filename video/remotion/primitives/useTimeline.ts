import { useCurrentFrame } from "remotion";

/**
 * Information about a single phase in a sequential timeline.
 */
export type PhaseInfo = {
  /** Absolute start frame. */
  start: number;
  /** Absolute end frame (exclusive). */
  end: number;
  /** Normalized progress 0-1 within this phase, clamped. */
  t: number;
  /** True if the current frame is within [start, end). */
  active: boolean;
  /** True if the current frame is >= end (phase already done). */
  past: boolean;
};

/**
 * Convert a list of phase durations (in frames at composition fps) into an
 * array of PhaseInfo so slides can express motion as sequential phases rather
 * than absolute frames.
 *
 * This mitigates frame-precision drift when voiceover duration shifts the
 * scene length — each phase's offset is computed relative to the previous.
 *
 * Example:
 * ```ts
 * const phases = useTimeline([30, 30, 60]);
 * // phases[0] active for frames 0-29
 * // phases[1] active for frames 30-59
 * // phases[2] active for frames 60-119
 * ```
 */
export const useTimeline = (phases: number[]): PhaseInfo[] => {
  const frame = useCurrentFrame();

  const result: PhaseInfo[] = [];
  let cursor = 0;
  for (const duration of phases) {
    const start = cursor;
    const end = cursor + duration;
    const span = end - start;
    const t =
      span <= 0
        ? 0
        : Math.max(0, Math.min(1, (frame - start) / span));
    result.push({
      start,
      end,
      t,
      active: frame >= start && frame < end,
      past: frame >= end,
    });
    cursor = end;
  }
  return result;
};
