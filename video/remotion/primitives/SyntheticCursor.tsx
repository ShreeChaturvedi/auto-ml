import React from "react";
import { useCurrentFrame } from "remotion";
import { ClickRipple } from "./ClickRipple";

export type CursorWaypoint = {
  /** Frame at which the cursor SHOULD be at (x, y). The cursor tween arrives
   * at this waypoint using Fitts's-law deceleration from the previous waypoint. */
  at: number;
  x: number;
  y: number;
  /** If set, a click fires at this frame (emits a ClickRipple + press scale). */
  clickAt?: number;
};

export type CursorPhysics = {
  /** 3-4 px overshoot on long moves, corrected over 4 frames. Default 3. */
  overshootPx?: number;
  /** Idle ±jitter in pixels. Default 1.5. */
  jitterPx?: number;
  /** Click press: scale 1 → pressScale → 1 over 8 frames. Default 0.88. */
  pressScale?: number;
  /** Minimum move-distance (px) before overshoot kicks in. Default 200. */
  overshootThresholdPx?: number;
};

export type SyntheticCursorProps = {
  path: readonly CursorWaypoint[];
  theme?: "light" | "dark";
  physics?: CursorPhysics;
};

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

const PRESS_FRAMES = 8;
const PRESS_HALF = 4;

/**
 * Choreographed cursor. Each segment between waypoints tweens with Fitts's-law
 * deceleration (easeOutCubic). Long segments overshoot 3 px around the 82%
 * mark and correct back by segment end. Idle state adds a breathing sub-pixel
 * jitter. Clicks emit a ClickRipple and apply a press-scale pulse.
 */
export const SyntheticCursor: React.FC<SyntheticCursorProps> = ({
  path,
  theme = "dark",
  physics,
}) => {
  const frame = useCurrentFrame();
  const {
    overshootPx = 3,
    jitterPx = 1.5,
    pressScale = 0.88,
    overshootThresholdPx = 200,
  } = physics ?? {};

  if (path.length === 0) return null;

  const first = path[0]!;
  const last = path[path.length - 1]!;

  // Resolve cursor position by finding the active segment.
  let x = first.x;
  let y = first.y;
  let isMoving = false;

  if (frame <= first.at) {
    x = first.x;
    y = first.y;
  } else if (frame >= last.at) {
    x = last.x;
    y = last.y;
  } else {
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      if (frame >= a.at && frame <= b.at) {
        const span = b.at - a.at;
        const rawT = span <= 0 ? 1 : (frame - a.at) / span;
        const t = easeOutCubic(Math.max(0, Math.min(1, rawT)));
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        isMoving = dist > 0.5;

        x = a.x + dx * t;
        y = a.y + dy * t;

        if (dist > overshootThresholdPx && rawT > 0.82 && rawT < 1) {
          // Peak overshoot at ~82% decays to zero by 100%.
          const overshootT = (rawT - 0.82) / 0.18;
          const bump = Math.sin(overshootT * Math.PI) * overshootPx;
          const ux = dx / dist;
          const uy = dy / dist;
          x += ux * bump;
          y += uy * bump;
        }
        break;
      }
    }
  }

  // Idle jitter when not actively moving between distinct waypoints.
  if (!isMoving) {
    const jx = (jitterPx * (Math.sin(frame * 0.15) + Math.sin(frame * 0.11))) / 2;
    const jy = (jitterPx * (Math.sin(frame * 0.17 + 1.3) + Math.sin(frame * 0.13 + 0.7))) / 2;
    x += jx;
    y += jy;
  }

  // Click press: scale dips for first 4 frames, returns over next 4.
  let scale = 1;
  const activeClick = path.find(
    (wp) => wp.clickAt !== undefined && frame >= wp.clickAt && frame <= wp.clickAt + PRESS_FRAMES,
  );
  if (activeClick && activeClick.clickAt !== undefined) {
    const t = frame - activeClick.clickAt;
    if (t < PRESS_HALF) {
      scale = 1 + (pressScale - 1) * (t / PRESS_HALF);
    } else {
      scale = pressScale + (1 - pressScale) * ((t - PRESS_HALF) / PRESS_HALF);
    }
  }

  return (
    <>
      {path.map((wp) =>
        wp.clickAt !== undefined ? (
          <ClickRipple
            key={`ripple-${wp.clickAt}`}
            at={wp.clickAt}
            x={wp.x}
            y={wp.y}
            theme={theme}
          />
        ) : null,
      )}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `translate(-4px, -4px) scale(${scale})`,
          transformOrigin: "4px 4px",
          pointerEvents: "none",
          willChange: "transform, left, top",
        }}
      >
        <CursorArrow theme={theme} />
      </div>
    </>
  );
};

/** macOS-style pointer arrow. Hotspot at (4, 4). Height 20px. */
const CursorArrow: React.FC<{ theme: "light" | "dark" }> = ({ theme }) => {
  const fill = theme === "dark" ? "#000000" : "#FFFFFF";
  const stroke = theme === "dark" ? "#FFFFFF" : "#000000";
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
      <path
        d="M4 2 L4 16.5 L7.2 13.3 L9.6 18.4 L11.4 17.6 L9 12.6 L13.3 12.6 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
};
