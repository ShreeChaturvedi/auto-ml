import React from "react";
import { Audio, Sequence, staticFile } from "remotion";

export type SfxTriggerProps = {
  /** Frame at which the SFX should begin playing. */
  at: number;
  /** Audio file path relative to `public/sfx/` (or an absolute URL). */
  src: string;
  /** Playback volume 0..1. Default 1. */
  volume?: number;
  /** Clip length in frames. Default 120 (2 s @ 60 fps). */
  durationInFrames?: number;
  /** If true, the AudioBed will duck -6 dB while this SFX plays. Default false.
   *
   * TODO: AudioBed should consume this via React context once the bed's duck
   * state machine supports per-SFX triggers. For now this is a marker prop —
   * scenes can still pass it to track intent. */
  duckVO?: boolean;
};

const isAbsoluteUrl = (src: string): boolean =>
  /^https?:\/\//i.test(src) || src.startsWith("data:");

/**
 * One-shot SFX trigger: mounts a Remotion `<Audio>` wrapped in a `<Sequence>`
 * starting at `at`. `durationInFrames` bounds the clip window (Remotion
 * doesn't auto-detect audio length without probing, so callers supply it).
 */
export const SfxTrigger: React.FC<SfxTriggerProps> = ({
  at,
  src,
  volume = 1,
  durationInFrames = 120,
  // duckVO: reserved for AudioBed context integration — intentionally unused.
}) => {
  const url = isAbsoluteUrl(src) ? src : staticFile(src);
  return (
    <Sequence from={at} durationInFrames={durationInFrames} layout="none">
      <Audio src={url} volume={volume} />
    </Sequence>
  );
};
