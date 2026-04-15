import React, { type ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { ChromeAddressBar } from "./ChromeAddressBar";

/**
 * Continuity tokens shared by all three chrome variants so cross-fades
 * between them never jump. Keep padding/radius/border/shadow identical —
 * only the title-bar contents differ.
 */
const CONTINUITY = {
  padding: 96,
  radius: 24,
  border: "1px solid rgba(255,255,255,0.08)",
  shadow: "0 40px 120px -20px rgba(0,0,0,0.6)",
  titleBarHeight: 40,
  trafficLightSize: 12,
} as const;

export type BrowserChromeVariant = "mac" | "browser" | "none";

export type BrowserChromeProps = {
  variant: BrowserChromeVariant;
  /** URL displayed in the browser address bar when variant === "browser". */
  url?: string;
  /** Background of the outer area (the "wallpaper" around the window). */
  outerBackground?: string;
  children: ReactNode;
};

/**
 * Window chrome with three variants:
 *  - `mac`     — macOS-style title bar with traffic lights
 *  - `browser` — Chrome-style title bar with traffic lights + centered URL pill
 *  - `none`    — full-bleed, no frame, children cover 1920×1080
 *
 * All variants share `CONTINUITY` tokens (padding / radius / border / shadow)
 * so transitions between them are visually continuous.
 */
export const BrowserChrome: React.FC<BrowserChromeProps> = ({
  variant,
  url,
  outerBackground = "#0A0A0B",
  children,
}) => {
  if (variant === "none") {
    return (
      <AbsoluteFill style={{ background: outerBackground }}>{children}</AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        background: outerBackground,
        padding: CONTINUITY.padding,
        alignItems: "stretch",
        justifyContent: "stretch",
      }}
    >
      <div
        style={{
          flex: 1,
          borderRadius: CONTINUITY.radius,
          border: CONTINUITY.border,
          boxShadow: CONTINUITY.shadow,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
        }}
      >
        <ChromeTitleBar variant={variant} url={url} />
        <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ChromeTitleBar: React.FC<{ variant: "mac" | "browser"; url?: string }> = ({
  variant,
  url,
}) => {
  // Title bar with traffic lights (always LEFT)
  const trafficLights = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Dot color="#FF5F57" />
      <Dot color="#FEBC2E" />
      <Dot color="#28C840" />
    </div>
  );

  if (variant === "mac") {
    return (
      <div
        style={{
          height: CONTINUITY.titleBarHeight,
          background: "#F5F5F7",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
        }}
      >
        {trafficLights}
      </div>
    );
  }

  // variant === "browser"
  return (
    <div
      style={{
        height: CONTINUITY.titleBarHeight,
        background: "#F5F5F7",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "0 16px",
      }}
    >
      {trafficLights}
      <ChromeAddressBar url={url ?? ""} />
      <div style={{ width: 48 }} />
      {/* right gutter to visually center the URL pill */}
    </div>
  );
};

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{
      width: CONTINUITY.trafficLightSize,
      height: CONTINUITY.trafficLightSize,
      borderRadius: "50%",
      background: color,
    }}
  />
);
