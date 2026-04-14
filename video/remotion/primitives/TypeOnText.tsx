import React from "react";
import { useCurrentFrame } from "remotion";

/** 2 frames per character — use for substantial reading copy. */
export const READING_RATE = 2;
/** 3 frames per character — use for UI labels / slow-reveal annotations. */
export const LABEL_RATE = 3;

export type TypeOnTextProps = {
  text: string;
  /** Rate in frames per character. Use READING_RATE (2) or LABEL_RATE (3), or custom. Default READING_RATE. */
  rate?: number;
  /** Frames to wait before typing starts. Default 0. */
  delay?: number;
  /** Show blinking caret at tail while typing. Default true. */
  caret?: boolean;
  /** Hide caret after N frames of completion. Default 30. */
  caretFadeOutAfter?: number;
  style?: React.CSSProperties;
  children?: never;
};

/** 30 frames on, 30 frames off — one full blink cycle every 60f (~1 blink per second at 60fps). */
const CARET_BLINK_PERIOD_FRAMES = 30;

/**
 * Frame-driven character-by-character text reveal, with a blinking terminal
 * caret that fades out after the string finishes. Uses string-slicing (the
 * Remotion-recommended typewriter pattern), never per-character opacity.
 *
 * Never use on names or long body copy — names use `useFadeIn`.
 */
export const TypeOnText: React.FC<TypeOnTextProps> = ({
  text,
  rate = READING_RATE,
  delay = 0,
  caret = true,
  caretFadeOutAfter = 30,
  style,
}) => {
  const frame = useCurrentFrame();
  const charsVisible = Math.max(
    0,
    Math.min(text.length, Math.floor((frame - delay) / rate)),
  );
  const visibleText = text.slice(0, charsVisible);

  const completeFrame = delay + text.length * rate;
  const isComplete = charsVisible === text.length;
  const caretHidden = isComplete && frame > completeFrame + caretFadeOutAfter;
  const caretOn =
    caret &&
    !caretHidden &&
    Math.floor(frame / CARET_BLINK_PERIOD_FRAMES) % 2 === 0;

  return (
    <span style={style}>
      {visibleText}
      {caret && !caretHidden ? (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            marginLeft: 2,
            opacity: caretOn ? 1 : 0,
          }}
        >
          |
        </span>
      ) : null}
    </span>
  );
};
