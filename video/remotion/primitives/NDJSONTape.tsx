import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../config/easing";
import { MONOSPACE_FONT } from "../../config/fonts";
import { ARCH_PALETTE } from "../../config/arch-layout";

export type NDJSONPill = {
  /** Stable key. */
  id: string;
  /** Text content rendered inside the pill (e.g. `⚙ execute complete`). */
  label: string;
  /** Absolute frame at which this pill enters the tape. */
  enterFrame: number;
  /** Accent color on the left side of the pill. Default `#3B82F6`. */
  color?: string;
};

export type NDJSONTapeProps = {
  /** Event list — each pill has its own `enterFrame`. */
  pills: NDJSONPill[];
  /** Tape container width. */
  width: number;
  /** Tape container height. Default 60. */
  height?: number;
  /** Orientation: "horizontal" (default) scrolls pills leftward; "vertical"
   *  stacks pills newest-first and scrolls upward. */
  orientation?: "horizontal" | "vertical";
  /** Pill width. Default 260. */
  pillWidth?: number;
  /** Pill spacing. Default 12. */
  pillGap?: number;
  /** Frames to hold before a pill begins scrolling. Default 60 (1s). */
  holdFrames?: number;
  /** Frames to scroll one pill-slot worth of travel. Default 30. */
  scrollDurationFrames?: number;
};

export type VisiblePill = {
  pill: NDJSONPill;
  /** Current x offset inside the tape. */
  x: number;
  /** Current y offset inside the tape. */
  y: number;
  /** Opacity (ramps during enter/exit). */
  opacity: number;
};

const DEFAULT_PILL_W = 260;
const DEFAULT_PILL_GAP = 12;
const DEFAULT_HOLD_FRAMES = 60;
const DEFAULT_SCROLL_FRAMES = 30;
const DEFAULT_HEIGHT = 60;
const PILL_FADE_FRAMES = 12;

/**
 * Pure function: given current frame, pill list, and layout, return each
 * pill's position + opacity on the tape. Used by the render path and by
 * tests to validate bead-math without spinning up a compositor.
 *
 * Algorithm (horizontal):
 *   - Each pill starts at x = 0 (right edge when anchored right) at `enterFrame`.
 *   - After `holdFrames` it begins scrolling left by one slot-stride per
 *     newer pill (stride = pillWidth + pillGap).
 */
export const computeVisiblePills = (
  frame: number,
  pills: NDJSONPill[],
  opts: Omit<NDJSONTapeProps, "pills"> = { width: 600 },
): VisiblePill[] => {
  const {
    pillWidth = DEFAULT_PILL_W,
    pillGap = DEFAULT_PILL_GAP,
    holdFrames = DEFAULT_HOLD_FRAMES,
    scrollDurationFrames = DEFAULT_SCROLL_FRAMES,
    orientation = "horizontal",
    height = DEFAULT_HEIGHT,
    width,
  } = opts;

  const pillHeight = height;
  const stride =
    orientation === "horizontal" ? pillWidth + pillGap : pillHeight + pillGap;

  const visible: VisiblePill[] = [];
  for (let i = 0; i < pills.length; i += 1) {
    const pill = pills[i]!;
    // Skip pills whose enter frame hasn't arrived.
    if (frame < pill.enterFrame) continue;

    // How many newer pills have entered? Their count dictates how far this
    // pill has scrolled from its landing slot.
    let newerCount = 0;
    for (let j = i + 1; j < pills.length; j += 1) {
      if (frame >= pills[j]!.enterFrame + holdFrames) newerCount += 1;
    }

    // Fractional scroll contribution from the nearest newer pill actively
    // scrolling past the hold boundary.
    let fractional = 0;
    for (let j = i + 1; j < pills.length; j += 1) {
      const np = pills[j]!;
      const scrollStart = np.enterFrame + holdFrames;
      const scrollEnd = scrollStart + scrollDurationFrames;
      if (frame >= scrollStart && frame < scrollEnd) {
        fractional = interpolate(frame, [scrollStart, scrollEnd], [0, 1], {
          easing: EASE_OUT,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        break;
      }
    }

    const slotOffset = (newerCount + fractional) * stride;

    // Entry translate + fade — pills enter from the right (or bottom).
    const entryProgress = interpolate(
      frame,
      [pill.enterFrame, pill.enterFrame + PILL_FADE_FRAMES],
      [0, 1],
      { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const enterOffset = (1 - entryProgress) * 40;

    // Compute x/y based on orientation. For horizontal we anchor pills to the
    // right edge so new pills appear there and older ones scroll left.
    let x = 0;
    let y = 0;
    if (orientation === "horizontal") {
      const rightAnchor = width - pillWidth;
      x = rightAnchor - slotOffset + enterOffset;
      // Hide pills whose left edge has scrolled off the tape.
      if (x + pillWidth < 0) continue;
    } else {
      x = 0;
      y = slotOffset + enterOffset;
      if (y > height * 8) continue; // bail after 8 slots worth
    }

    // Opacity — fade in on entry; fade out when pill leaves the tape viewport.
    const opacity = entryProgress;

    visible.push({ pill, x, y, opacity });
  }

  return visible;
};

export const NDJSONTape: React.FC<NDJSONTapeProps> = (props) => {
  const frame = useCurrentFrame();
  const {
    pills,
    width,
    height = DEFAULT_HEIGHT,
    pillWidth = DEFAULT_PILL_W,
    orientation = "horizontal",
  } = props;
  const visible = computeVisiblePills(frame, pills, props);

  return (
    <div
      style={{
        position: "relative",
        width,
        height:
          orientation === "horizontal" ? height : Math.max(height, 480),
        overflow: "hidden",
      }}
    >
      {visible.map((v) => (
        <div
          key={v.pill.id}
          style={{
            position: "absolute",
            left: v.x,
            top: orientation === "horizontal" ? (height - 40) / 2 : v.y,
            width: pillWidth,
            height: orientation === "horizontal" ? 40 : 36,
            opacity: v.opacity,
            background: ARCH_PALETTE.paper,
            border: `1px solid ${ARCH_PALETTE.hairline}`,
            borderLeft: `3px solid ${v.pill.color ?? "#3B82F6"}`,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 14,
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
            fontFamily: MONOSPACE_FONT.fontFamily,
            color: ARCH_PALETTE.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {v.pill.label}
        </div>
      ))}
    </div>
  );
};
