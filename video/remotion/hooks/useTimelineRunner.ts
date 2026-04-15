import { useMemo } from "react";
import type {
  AppTimelineEvent,
  SceneWithMetadata,
} from "../../config/scenes";
import { useVoiceoverAlignment } from "./useVoiceoverAlignment";

/** Superset input so the hook works for any scene that carries a VO-anchored timeline. */
export type TimelineRunnerScene = {
  timeline?: readonly AppTimelineEvent[];
  voiceoverFile?: string;
};

export type ResolvedTimelineEvent = AppTimelineEvent & { resolvedStart: number };

export type TimelineRunnerResult = {
  events: readonly ResolvedTimelineEvent[];
  triggerMap: Readonly<Record<string, number>>;
  byKind: Readonly<Record<AppTimelineEvent["kind"], readonly ResolvedTimelineEvent[]>>;
};

/** All timeline-event kinds, used to seed the `byKind` accessor map. */
const EVENT_KINDS: readonly AppTimelineEvent["kind"][] = [
  "scrollTo",
  "cursorTo",
  "click",
  "type",
  "zoom",
  "toolCall",
  "llmToken",
  "assemble",
  "navigate",
  "sfx",
] as const;

/**
 * Walks the scene's `timeline`, resolves each event's `start` (absolute frame,
 * `{mark}` VO anchor, or `{after, offset?}` chain reference) to an absolute
 * frame via the voiceover-alignment handle, and returns:
 *
 *   - `events`: the resolved list in original order, each event's raw payload
 *               + `resolvedStart` (number of frames into the scene).
 *   - `triggerMap`: `event.id → completion-frame` so a later event's
 *                   `{after: "prevId"}` resolves to `prevId`'s end frame
 *                   (start + durationFrames).
 *   - `byKind`: events grouped by kind for ergonomic consumption (cursor
 *               waypoints, scroll keyframes, zoom regions, etc.).
 */
export function useTimelineRunner(
  scene: TimelineRunnerScene,
  meta: SceneWithMetadata,
  /** Raw VO script with {{MARK}} tokens. Scenes pass this from a fixture. */
  rawScript: string,
): TimelineRunnerResult {
  const alignment = useVoiceoverAlignment(meta, rawScript);

  return useMemo(() => {
    const timeline = scene.timeline ?? [];
    const triggerMap: Record<string, number> = {};
    const resolved: ResolvedTimelineEvent[] = [];

    for (const event of timeline) {
      const resolvedStart = alignment.resolveStart(event.start, triggerMap);
      // Store the COMPLETION frame so `{after: id}` means "after id finishes".
      triggerMap[event.id] = resolvedStart + (event.durationFrames ?? 0);
      resolved.push({ ...event, resolvedStart });
    }

    const byKind = Object.fromEntries(
      EVENT_KINDS.map((kind) => [
        kind,
        resolved.filter((event) => event.kind === kind),
      ]),
    ) as unknown as Record<AppTimelineEvent["kind"], readonly ResolvedTimelineEvent[]>;

    return { events: resolved, triggerMap, byKind };
  }, [scene.timeline, alignment]);
}
