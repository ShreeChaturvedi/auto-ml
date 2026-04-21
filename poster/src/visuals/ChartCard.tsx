import React from "react";
import { CARD } from "../tokens";

/**
 * Shared card chrome used by §4 charts (SpeedBarChart, GuardrailTable,
 * PercentileGauge wrapper) and the §5 safety cards. Pulls colors, border,
 * and radius from the `CARD` token so every container on the poster reads
 * as the same elevation system.
 */

export const ChartCard: React.FC<{
  children: React.ReactNode;
  padding?: number;
  style?: React.CSSProperties;
}> = ({ children, padding = CARD.padding, style }) => (
  <div
    style={{
      background: CARD.bg,
      border: CARD.border,
      borderRadius: CARD.radius,
      padding,
      boxSizing: "border-box",
      ...style,
    }}
  >
    {children}
  </div>
);
