import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

/**
 * Frame-driven URL typer for the UrlIntro scene.
 *
 * Pure function of `useCurrentFrame()` — no external state, so the primitive
 * is deterministic, seekable in the Studio, and trivial to unit-test. Meant
 * to render inside `ChromeAddressBar` via BrowserChrome's `urlChildren` prop.
 *
 * Behavior:
 *   - Before `startFrame`: empty string with a blinking caret.
 *   - Between `startFrame` and `startFrame + url.length * rate`: chars reveal
 *     one-per-rate-frames; caret still blinks at the cursor position.
 *   - Between end-of-typing and `commitFrame`: full URL, caret still blinks.
 *   - From `commitFrame` to `commitFrame + commitDurationFrames`: caret hides,
 *     url text scales 1.0 → 1.03 → 1.0 (subtle commit pop).
 *   - After commit: full URL, no caret, steady state.
 */
export type AddressBarTyperProps = {
  /** URL to type. */
  url: string;
  /** Frame at which typing begins. */
  startFrame: number;
  /** Frames per character. Default 3 (50 ms @ 60 fps). */
  rate?: number;
  /** Frame at which the commit flash fires. */
  commitFrame: number;
  /** Duration of the commit flash. Default 6 frames (100 ms @ 60 fps). */
  commitDurationFrames?: number;
};

const CARET_BLINK_PERIOD_FRAMES = 30; // 500 ms on/off @ 60 fps
const COMMIT_POP_PEAK = 1.03;

/**
 * Pure keyframe calculator for AddressBarTyper visual state. Exported so
 * keyframe arithmetic can be verified without spinning up Remotion.
 *
 * Caret behavior:
 *   - Before typing: blinks (30 f period, 50% duty)
 *   - During typing: hidden (real address bars hide caret while keys are held)
 *   - After typing, before commit: blinks again
 *   - From commit onward: hidden permanently
 */
export const computeAddressBarTyper = (
  frame: number,
  url: string,
  startFrame: number,
  rate: number,
  commitFrame: number,
  commitDurationFrames: number,
): { typed: string; caretVisible: boolean; popScale: number } => {
  const typedCount = Math.max(
    0,
    Math.min(url.length, Math.floor((frame - startFrame) / rate)),
  );
  const typed = url.slice(0, typedCount);

  const typeEndFrame = startFrame + url.length * rate;
  const isTyping = frame >= startFrame && frame < typeEndFrame;

  const caretVisible =
    frame < commitFrame &&
    !isTyping &&
    frame % CARET_BLINK_PERIOD_FRAMES < CARET_BLINK_PERIOD_FRAMES / 2;

  const commitEnd = commitFrame + commitDurationFrames;
  const commitMid = commitFrame + commitDurationFrames / 2;
  let popScale = 1;
  if (frame >= commitFrame && frame <= commitEnd) {
    if (frame <= commitMid) {
      popScale = interpolate(frame, [commitFrame, commitMid], [1, COMMIT_POP_PEAK], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    } else {
      popScale = interpolate(frame, [commitMid, commitEnd], [COMMIT_POP_PEAK, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }

  return { typed, caretVisible, popScale };
};

export const AddressBarTyper: React.FC<AddressBarTyperProps> = ({
  url,
  startFrame,
  rate = 3,
  commitFrame,
  commitDurationFrames = 6,
}) => {
  const frame = useCurrentFrame();
  const { typed, caretVisible, popScale } = computeAddressBarTyper(
    frame,
    url,
    startFrame,
    rate,
    commitFrame,
    commitDurationFrames,
  );

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        transform: `scale(${popScale})`,
        transformOrigin: "left center",
        whiteSpace: "pre",
        fontSize: 13,
        color: "#3C3C43",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontFeatureSettings: '"tnum"',
      }}
    >
      <span>{typed}</span>
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 1.5,
          height: 14,
          marginLeft: typed.length > 0 ? 1 : 0,
          background: "#3c4043",
          opacity: caretVisible ? 1 : 0,
        }}
      />
    </span>
  );
};
