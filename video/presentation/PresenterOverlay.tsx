import React from "react";
import { MONOSPACE_FONT } from "../config/fonts";

export type PresenterOverlayProps = {
  index: number;
  total: number;
  sceneId: string;
  speed: number;
};

/**
 * Minimal HUD.
 *
 * Outer wrapper is `pointer-events: none` — overlay never intercepts Player
 * input. Any future interactive element would have to re-enable pointer
 * events locally.
 *
 * Layout (bottom of screen):
 *   - left   : `N / 29` slide counter + current slide id
 *   - center : row of `total` pips, current one filled
 *   - right  : `1×` / `2×` speed indicator + compact keyboard hint
 *
 * Hidden by `H`. Toggled in `App` via `showUi` state.
 */
export const PresenterOverlay: React.FC<PresenterOverlayProps> = ({
  index,
  total,
  sceneId,
  speed,
}) => {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        color: "rgba(247, 247, 247, 0.75)",
        fontFeatureSettings: '"ss01", "ss02", "calt", "tnum"',
      }}
    >
      {/* Bottom-left: counter + current slide id */}
      <div
        style={{
          position: "absolute",
          left: 24,
          bottom: 20,
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          ...MONOSPACE_FONT,
          fontSize: 14,
          letterSpacing: "0.02em",
        }}
      >
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <span style={{ opacity: 0.55 }}>{sceneId}</span>
      </div>

      {/* Bottom-center: pips */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 24,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 6,
        }}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                i === index
                  ? "rgba(247, 247, 247, 0.95)"
                  : "rgba(247, 247, 247, 0.22)",
              transition: "background 120ms linear",
            }}
          />
        ))}
      </div>

      {/* Bottom-right: speed + keyboard hint */}
      <div
        style={{
          position: "absolute",
          right: 24,
          bottom: 20,
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          ...MONOSPACE_FONT,
          fontSize: 14,
          letterSpacing: "0.02em",
        }}
      >
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{speed}×</span>
        <span style={{ opacity: 0.55 }}>← →  P  R  E  F  H  2</span>
      </div>
    </div>
  );
};
