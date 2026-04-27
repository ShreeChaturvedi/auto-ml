import React from "react";
import { COLORS } from "../theme";

/**
 * 2-px institutional rule — Miami Red 0-25% hard-cut to Divider Tan 25-100%.
 * Ported from `poster/src/visuals/MiamiDivider.tsx`. The gradient string is
 * inlined here (rather than imported) because the booklet doesn't need the
 * rest of the poster's MIAMI_DIVIDER_GRADIENT context.
 */

const GRADIENT = `linear-gradient(to right, ${COLORS.MIAMI_RED} 0%, ${COLORS.MIAMI_RED} 25%, ${COLORS.DIVIDER_TAN} 25%, ${COLORS.DIVIDER_TAN} 100%)`;

export const MiamiDivider: React.FC<{ heightPx?: number }> = ({
  heightPx = 2,
}) => (
  <div
    role="separator"
    style={{
      width: "100%",
      height: heightPx,
      background: GRADIENT,
    }}
  />
);
