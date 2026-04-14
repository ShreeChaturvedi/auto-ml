import React from "react";
import { AbsoluteFill } from "remotion";
import type { Theme } from "../../config/themes";
import { COLORS, getChromeGradient } from "../../config/themes";

type Props = {
  theme: Theme;
  children: React.ReactNode;
  /** Outer padding (px) around the chrome frame. Default 96. */
  padding?: number;
  /** Border radius of the window frame in px. Default 24. */
  radius?: number;
  /** Optional overlay (e.g. chapter label) rendered inside the frame. */
  overlay?: React.ReactNode;
};

/**
 * Macro "app window" wrapper used around the demo screen recording.
 *
 * Style: Linear/Vercel launch-video aesthetic — gradient background, soft
 * shadow, rounded window with a subtle title bar. Children fill the inner
 * area at 16:9.
 */
export const AppChrome: React.FC<Props> = ({
  theme,
  children,
  padding = 96,
  radius = 24,
  overlay,
}) => {
  const c = COLORS[theme];
  return (
    <AbsoluteFill
      style={{
        background: getChromeGradient(theme),
        padding,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius,
          overflow: "hidden",
          background: c.BACKGROUND_ELEVATED,
          border: `1px solid ${c.BORDER_COLOR}`,
          boxShadow:
            theme === "dark"
              ? "0 40px 120px -20px rgba(0,0,0,0.6)"
              : "0 40px 120px -20px rgba(0,0,0,0.25)",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TitleBar theme={theme} />
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {children}
          {overlay}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const TitleBar: React.FC<{ theme: Theme }> = ({ theme }) => {
  const c = COLORS[theme];
  return (
    <div
      style={{
        height: 36,
        display: "flex",
        alignItems: "center",
        paddingInline: 16,
        gap: 8,
        borderBottom: `1px solid ${c.BORDER_COLOR}`,
        background: c.BACKGROUND,
      }}
    >
      {["#FF5F57", "#FEBC2E", "#28C840"].map((color) => (
        <div
          key={color}
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            background: color,
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
};
