import React from "react";
import { COLORS } from "../theme";

/**
 * Elevation wrapper used by `SpeedBarChart`, `GuardrailTable`, and
 * `PercentileGauge`. Inlined here (rather than imported cross-workspace)
 * because the poster's `ChartCard` lives inside `Section4Results.tsx` —
 * see `./README.md` for the contract.
 */
export const ChartCard: React.FC<{
  children: React.ReactNode;
  padding?: number;
  style?: React.CSSProperties;
}> = ({ children, padding = 10, style }) => (
  <div
    style={{
      background: COLORS.PAPER_ELEVATED,
      border: `0.75pt solid ${COLORS.HAIRLINE}`,
      borderRadius: 6,
      padding,
      boxSizing: "border-box",
      ...style,
    }}
  >
    {children}
  </div>
);
