import React from "react";
import { ARCH_PALETTE } from "../../config/arch-layout";
import { MONOSPACE_FONT } from "../../config/fonts";

export type SceneCornerMarkProps = {
  /** Scene number (1-indexed). E.g. `3` renders "scene 3 / 6". */
  scene: number;
  /** Total scene count in the section. Defaults to the arch-section total (6). */
  total?: number;
};

/**
 * Top-right scene counter — tiny monospace label pinned above the divider
 * band. Mirrors the inline implementation introduced in ArchHookSlide so the
 * chrome is identical across every scene in the Architecture section.
 *
 * Layout contract — must match the ArchHookSlide reference:
 *   position: absolute, right: 200, top: 96
 *   MONOSPACE_FONT / 14px / ARCH_PALETTE.mute
 *   text: `scene {scene} / {total}`
 *
 * The element is pointer-events:none so it never intercepts clicks and
 * inherits no parent transforms (scene files drop it outside any scaled
 * wrapper).
 */
export const SceneCornerMark: React.FC<SceneCornerMarkProps> = ({
  scene,
  total = 6,
}) => (
  <div
    style={{
      position: "absolute",
      right: 200,
      top: 96,
      ...MONOSPACE_FONT,
      fontSize: 14,
      color: ARCH_PALETTE.mute,
      pointerEvents: "none",
    }}
  >
    scene {scene} / {total}
  </div>
);
