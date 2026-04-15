import React from "react";
import { Audio, staticFile } from "remotion";

export type VoWindow = { start: number; end: number };

export type AudioBedProps = {
  /** Music file path — passed through staticFile() if not an absolute URL. */
  src: string;
  /** Base volume for the bed (before ducking). Default 0.12 (≈ -18 dBFS). */
  baseVolume?: number;
  /** VO ducking: how much to attenuate when VO is playing, in dB. Default -12. */
  duckDb?: number;
  /** Optional VO windows (frame ranges where VO is audible). If not provided,
   * the bed plays at baseVolume for the entire comp. */
  voWindows?: readonly VoWindow[];
};

const isAbsoluteUrl = (src: string): boolean =>
  /^https?:\/\//i.test(src) || src.startsWith("data:");

const DEFAULT_ATTACK = 12;
const DEFAULT_RELEASE = 24;

/**
 * Pure duck-multiplier helper. Given the current frame, VO windows, attack
 * and release envelopes, and a duck depth in dB, returns a multiplier in
 * [10^(duckDb/20), 1]. Exported for unit tests.
 *
 * - Attack: inside the first `attackFrames` of a VO window, linearly ramps
 *   the bed down from 1 to duckFactor.
 * - Sustain: fully ducked until VO window ends.
 * - Release: over `releaseFrames` after the VO window ends, ramps back up.
 */
export const computeDuck = (
  frame: number,
  voWindows: readonly VoWindow[] | undefined,
  duckDb: number,
  attackFrames: number = DEFAULT_ATTACK,
  releaseFrames: number = DEFAULT_RELEASE,
): number => {
  const duckFactor = Math.pow(10, duckDb / 20);
  if (!voWindows || voWindows.length === 0) return 1;

  // Find the "most ducking wanted" factor across all windows.
  let minMult = 1;
  for (const w of voWindows) {
    let mult = 1;
    if (frame < w.start - releaseFrames) {
      mult = 1;
    } else if (frame < w.start) {
      // Pre-roll: only if the previous release didn't reach here.
      mult = 1;
    } else if (frame >= w.start && frame < w.start + attackFrames) {
      const p = (frame - w.start) / attackFrames;
      mult = 1 + (duckFactor - 1) * p;
    } else if (frame >= w.start + attackFrames && frame <= w.end) {
      mult = duckFactor;
    } else if (frame > w.end && frame <= w.end + releaseFrames) {
      const p = (frame - w.end) / releaseFrames;
      mult = duckFactor + (1 - duckFactor) * p;
    } else {
      mult = 1;
    }
    if (mult < minMult) minMult = mult;
  }
  return minMult;
};

/**
 * Ambient music bed. Mounted once at composition root, wraps a Remotion
 * `<Audio>` with a frame-dependent `volume` function that ducks by `duckDb`
 * during VO windows with smooth attack/release envelopes.
 */
export const AudioBed: React.FC<AudioBedProps> = ({
  src,
  baseVolume = 0.12,
  duckDb = -12,
  voWindows,
}) => {
  const url = isAbsoluteUrl(src) ? src : staticFile(src);
  const volumeFn = (frame: number): number =>
    baseVolume * computeDuck(frame, voWindows, duckDb);
  return <Audio src={url} volume={volumeFn} />;
};
