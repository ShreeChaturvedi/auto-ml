import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * macOS Safari chrome wrapping a screenshot region. The traffic-light dots,
 * URL pill, and hairline border are drawn in SVG/CSS so the frame stays
 * pixel-crisp at print resolution. Children fill the content area below
 * the 28-pt tab bar.
 */
export const BrowserChromeFrame: React.FC<{
  url?: string;
  width?: number | string;
  height?: number | string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({
  url = "agentic-automl.vercel.app",
  width = "100%",
  height = "auto",
  children,
  style,
}) => (
  <div
    style={{
      width,
      height,
      background: COLORS.PAPER,
      border: `0.75pt solid ${COLORS.HAIRLINE}`,
      borderRadius: 6,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      ...style,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: COLORS.SURFACE,
        borderBottom: `0.5pt solid ${COLORS.HAIRLINE}`,
        height: 28,
        flexShrink: 0,
      }}
    >
      <TrafficLight color="#FF5F57" />
      <TrafficLight color="#FEBC2E" />
      <TrafficLight color="#28C840" />
      <div
        style={{
          flex: 1,
          height: 18,
          background: COLORS.PAPER,
          border: `0.5pt solid ${COLORS.HAIRLINE}`,
          borderRadius: 9,
          marginLeft: 12,
          marginRight: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 500,
          letterSpacing: "0.02em",
          color: COLORS.INK_MUTED,
        }}
      >
        {url}
      </div>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>
  </div>
);

const TrafficLight: React.FC<{ color: string }> = ({ color }) => (
  <span
    style={{
      width: 9,
      height: 9,
      borderRadius: 4.5,
      background: color,
      display: "inline-block",
    }}
  />
);
