import React from "react";
import { COLORS, FONTS, TYPE } from "../theme";

/**
 * Monaspace UPPERCASE eyebrow — the recurring small label that anchors
 * page sections ("01 / MODELS", "PHASE 03", "SPEED"). Ships as one
 * component so every instance has identical tracking.
 */
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  color?: string;
  size?: "small" | "large";
  style?: React.CSSProperties;
}> = ({ children, color = COLORS.INK_MUTED, size = "small", style }) => {
  const t = size === "large" ? TYPE.eyebrowLarge : TYPE.eyebrow;
  return (
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: t.size,
        fontWeight: t.weight,
        letterSpacing: t.tracking,
        lineHeight: t.lh,
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
