import React from "react";
import { MIAMI_DIVIDER_GRADIENT } from "../tokens";

/**
 * 2-px gradient rule used as the header divider. Miami Red 0-25% hard-cut
 * to Divider Tan 25-100% — the exact pattern from `getDividerGradient()`
 * in `video/config/themes.ts:118`. Stays 2 px regardless of canvas size
 * because print-shop rules say institutional rules should remain crisp.
 */
export const MiamiDivider: React.FC<{ heightPx?: number }> = ({
  heightPx = 2,
}) => (
  <div
    role="separator"
    style={{
      width: "100%",
      height: heightPx,
      background: MIAMI_DIVIDER_GRADIENT,
    }}
  />
);
