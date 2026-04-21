import { APP_DEMO_PRESETS, type AppDemoPreset } from "../../config/appDemo";

export type CoreBeatName = "landing" | "signup" | "home";
export type BeatName = CoreBeatName | AppDemoPreset;
export type BeatSelection = BeatName | "phases" | "all";

export const CORE_BEATS = [
  "landing",
  "signup",
  "home",
] as const satisfies readonly CoreBeatName[];

export const PHASE_BEATS = APP_DEMO_PRESETS;

export const INDIVIDUAL_BEATS = [
  ...CORE_BEATS,
  ...PHASE_BEATS,
] as const satisfies readonly BeatName[];

export const SUPPORTED_BEAT_SELECTIONS = [
  ...INDIVIDUAL_BEATS,
  "phases",
  "all",
] as const satisfies readonly BeatSelection[];

export function isBeatSelection(value: string): value is BeatSelection {
  return (SUPPORTED_BEAT_SELECTIONS as readonly string[]).includes(value);
}

export function expandBeatSelection(selection: BeatSelection): BeatName[] {
  if (selection === "phases") {
    return [...PHASE_BEATS];
  }
  if (selection === "all") {
    return [...CORE_BEATS, ...PHASE_BEATS];
  }
  return [selection];
}

export function formatBeatSelectionUsage(): string {
  return SUPPORTED_BEAT_SELECTIONS.join("|");
}
