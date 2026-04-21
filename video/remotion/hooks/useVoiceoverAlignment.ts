import { useMemo, useRef } from "react";
import { useVideoConfig } from "remotion";
import type {
  AppTimelineEvent,
  SceneWithMetadata,
} from "../../config/scenes";
import { resolveMarks } from "../../scripts/resolveMarks";

export type AlignmentHandle = {
  /** Frame for a named mark. Returns null if mark wasn't found. */
  frameForMark(name: string): number | null;
  /** Character spoken AT (or just before) the given frame, or null outside VO. */
  wordAt(frame: number): string | null;
  /**
   * Resolves a timeline event's `start` to an absolute frame, using
   * `triggerMap` (event id → absolute frame) for `{after}` refs.
   */
  resolveStart(
    start: AppTimelineEvent["start"],
    triggerMap: Record<string, number>,
  ): number;
};

/**
 * Runtime alignment handle for scenes that anchor animation events to named
 * marks in the voiceover. Memoises the `resolveMarks` walk per scene. If
 * the scene has no alignment sidecar, returns a no-op handle that resolves
 * all mark refs to frame 0 and logs a single warning.
 *
 * Pass `rawScript = null` when the scene has no `{{MARK}}`-annotated script
 * (e.g. Playwright-captured demo beats): mark-ref resolution is skipped and
 * any `{mark}` ref falls back to frame 0 with a one-shot console warning.
 */
export const useVoiceoverAlignment = (
  meta: SceneWithMetadata,
  rawScript: string | null,
): AlignmentHandle => {
  const { fps } = useVideoConfig();
  const warnedRef = useRef(false);
  const alignment = meta.alignment;

  const markFrames = useMemo(
    () =>
      alignment && rawScript ? resolveMarks(rawScript, alignment, fps) : null,
    [alignment, rawScript, fps],
  );

  return useMemo<AlignmentHandle>(() => {
    const warnOnce = () => {
      if (warnedRef.current) return;
      warnedRef.current = true;
      console.warn(
        "[useVoiceoverAlignment] scene has no/unknown alignment — mark refs → frame 0.",
      );
    };
    return {
      frameForMark: (name) => markFrames?.[name] ?? null,
      wordAt: (frame) => {
        if (!alignment) return null;
        const { characters, character_start_times_seconds } = alignment;
        let best: string | null = null;
        for (let i = 0; i < characters.length; i += 1) {
          const start = character_start_times_seconds[i] ?? 0;
          if (Math.round(start * fps) <= frame) best = characters[i] ?? null;
          else break;
        }
        return best;
      },
      resolveStart: (start, triggerMap) => {
        if (typeof start === "number") return start;
        if ("mark" in start) {
          const f = markFrames?.[start.mark];
          if (f == null) warnOnce();
          return f ?? 0;
        }
        return (triggerMap[start.after] ?? 0) + (start.offset ?? 0);
      },
    };
  }, [alignment, markFrames, fps]);
};
