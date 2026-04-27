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

  // Ghost placeholder — renders "Search Google or type a URL" in muted gray
  // for the first 6 frames before any character is typed, then fades to 0.
  // Pure JSX-level logic; computeAddressBarTyper signature is unchanged.
  const showGhost = typed.length === 0 && frame < startFrame + 6;
  const ghostOpacity = showGhost
    ? interpolate(frame, [startFrame, startFrame + 6], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <span
      style={{
        position: "relative",
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
      {ghostOpacity > 0 ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            color: "rgba(60,60,67,0.35)",
            opacity: ghostOpacity,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Search Google or type a URL
        </span>
      ) : null}
      <span>{typed}</span>
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 2,
          height: 14,
          marginLeft: typed.length > 0 ? 1 : 0,
          background: "#3c4043",
          boxShadow: "0 0 1px rgba(60,64,67,0.5)",
          opacity: caretVisible ? 1 : 0,
        }}
      />
    </span>
  );
};
