import React, { type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { ChromeAddressBar } from "./ChromeAddressBar";

/**
 * Continuity tokens shared by all three chrome variants so cross-fades
 * between them never jump. Keep padding/radius/border/shadow identical —
 * only the title-bar contents differ.
 *
 * Exported so callers (e.g. `Demo/index.tsx`) can reconstruct the chrome's
 * inner content rect for the chrome-dismiss transform without duplicating
 * magic numbers.
 */
export const CONTINUITY = {
  padding: 96,
  radius: 24,
  border: "1px solid rgba(255,255,255,0.08)",
  shadow: "0 40px 120px -20px rgba(0,0,0,0.6)",
  titleBarHeight: 40,
  tabStripHeight: 32,
  trafficLightSize: 12,
} as const;

export type BrowserChromeVariant = "mac" | "browser" | "none";

/** Single-tab descriptor for the Chrome-style tab strip. */
export type ChromeTab = {
  title: string;
  favicon?: string;
  active: boolean;
  /** Frame at which the tab fades in. Omit to render from frame 0. */
  appearFrame?: number;
};

export type BrowserChromeProps = {
  variant: BrowserChromeVariant;
  /** URL displayed in the browser address bar when variant === "browser". */
  url?: string;
  /**
   * When provided, replaces the static URL text inside the address bar with
   * arbitrary content. Used by `UrlIntro` to host an `<AddressBarTyper />`
   * primitive that animates URL text frame-by-frame.
   */
  urlChildren?: ReactNode;
  /**
   * When provided, renders a Chrome-style tab strip above the title bar.
   * Per-tab `appearFrame` drives fade-in for tabs that open mid-scene.
   */
  tabs?: ReadonlyArray<ChromeTab>;
  /** Background of the outer area (the "wallpaper" around the window). */
  outerBackground?: string;
  /**
   * Background of the inner card (the area behind the title bar + content).
   * Default "#ffffff". Pass "transparent" when the scene is rendering the
   * video content as a sibling underneath (chrome-dismiss transform).
   */
  cardBackground?: string;
  /**
   * Passthrough style for the outer AbsoluteFill. Typical use: chrome-dismiss
   * opacity tween + `pointer-events: none` once the chrome has fully faded.
   */
  style?: CSSProperties;
  /** Render traffic-light dots with gradient + inner shadow (opt-in polish). */
  glassTrafficLights?: boolean;
  /** Render a subtle 1px specular highlight on top of the title bar. */
  refinedTitleBar?: boolean;
  /** Render back/forward/refresh cluster left of the URL pill (browser variant only). */
  showNavCluster?: boolean;
  /** Optional — when absent, the content slot renders empty (for overlay use). */
  children?: ReactNode;
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
  urlChildren,
  tabs,
  outerBackground = "#0A0A0B",
  cardBackground = "#ffffff",
  style,
  glassTrafficLights = false,
  refinedTitleBar = false,
  showNavCluster = false,
  children,
}) => {
  if (variant === "none") {
    return (
      <AbsoluteFill style={{ background: outerBackground, ...style }}>
        {children}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        background: outerBackground,
        padding: CONTINUITY.padding,
        alignItems: "stretch",
        justifyContent: "stretch",
        ...style,
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
          background: cardBackground,
        }}
      >
        {tabs ? <ChromeTabStrip tabs={tabs} /> : null}
        <ChromeTitleBar
          variant={variant}
          url={url}
          urlChildren={urlChildren}
          glassTrafficLights={glassTrafficLights}
          refinedTitleBar={refinedTitleBar}
          showNavCluster={showNavCluster}
        />
        <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

type ChromeTitleBarProps = {
  variant: "mac" | "browser";
  url?: string;
  urlChildren?: ReactNode;
  glassTrafficLights?: boolean;
  refinedTitleBar?: boolean;
  showNavCluster?: boolean;
};

const ChromeTitleBar: React.FC<ChromeTitleBarProps> = ({
  variant,
  url,
  urlChildren,
  glassTrafficLights = false,
  refinedTitleBar = false,
  showNavCluster = false,
}) => {
  // Title bar with traffic lights (always LEFT)
  const trafficLights = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Dot color="#FF5F57" glass={glassTrafficLights} />
      <Dot color="#FEBC2E" glass={glassTrafficLights} />
      <Dot color="#28C840" glass={glassTrafficLights} />
    </div>
  );

  // Subtle 1px specular highlight ribbon at the top edge — only renders when
  // `refinedTitleBar` is opted-in. Base background unchanged.
  const titleBarHighlight = refinedTitleBar ? (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background:
          "linear-gradient(to bottom, rgba(255,255,255,0.6) 0%, transparent 100%)",
        pointerEvents: "none",
      }}
    />
  ) : null;

  if (variant === "mac") {
    return (
      <div
        style={{
          position: "relative",
          height: CONTINUITY.titleBarHeight,
          background: "#F5F5F7",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
        }}
      >
        {titleBarHighlight}
        {trafficLights}
      </div>
    );
  }

  // variant === "browser"
  // When `showNavCluster`, the leftmost grid cell holds traffic lights AND the
  // back/forward/refresh cluster in a single flex row. Grid stays 3-column so
  // the URL pill remains naturally centered by the `1fr` middle cell.
  return (
    <div
      style={{
        position: "relative",
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
      {titleBarHighlight}
      {showNavCluster ? (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {trafficLights}
          <NavCluster />
        </div>
      ) : (
        trafficLights
      )}
      {urlChildren !== undefined ? (
        <ChromeAddressBar>{urlChildren}</ChromeAddressBar>
      ) : (
        <ChromeAddressBar url={url ?? ""} />
      )}
      <div style={{ width: 48 }} />
      {/* right gutter to visually center the URL pill */}
    </div>
  );
};

/**
 * Back / forward / refresh glyph cluster rendered left of the URL pill when
 * `showNavCluster` is enabled. 14×14 SVGs at #8C8C92 with 8px gaps.
 */
const NavCluster: React.FC = () => (
  <div
    aria-hidden
    style={{ display: "flex", alignItems: "center", gap: 8, color: "#8C8C92" }}
  >
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12a9 9 0 0 1 15.5-6.2L21 8"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 3v5h-5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

/**
 * Chrome-style tab strip rendered above the title bar when `tabs` is provided.
 * Each tab can optionally fade in at `appearFrame` — enabling mid-scene "a
 * new tab opened" animations without re-mounting the component.
 */
const ChromeTabStrip: React.FC<{ tabs: ReadonlyArray<ChromeTab> }> = ({ tabs }) => {
  return (
    <div
      style={{
        height: CONTINUITY.tabStripHeight,
        background: "#DEE1E6",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "flex-end",
        gap: 2,
        padding: "0 8px",
      }}
    >
      {tabs.map((tab, i) => (
        <TabPill key={`${tab.title}-${i}`} tab={tab} />
      ))}
    </div>
  );
};

const TabPill: React.FC<{ tab: ChromeTab }> = ({ tab }) => {
  const frame = useCurrentFrame();
  // When `appearFrame` is set, fade in over 12 frames (200 ms @ 60 fps) starting
  // at `appearFrame`. Before that, the tab is invisible. Width also interpolates
  // from 0 so neighboring tabs slide into place instead of popping.
  const fadeIn =
    tab.appearFrame !== undefined
      ? interpolate(frame, [tab.appearFrame, tab.appearFrame + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <div
      style={{
        height: 28,
        minWidth: 0,
        maxWidth: 220 * fadeIn,
        opacity: fadeIn,
        background: tab.active ? "#ffffff" : "transparent",
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: "#3C3C43",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {tab.favicon ? (
        <Img src={tab.favicon} alt="" width={14} height={14} style={{ flexShrink: 0 }} />
      ) : (
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: tab.active ? "#4285F4" : "#9AA0A6",
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{tab.title}</span>
    </div>
  );
};

const Dot: React.FC<{ color: string; glass?: boolean }> = ({ color, glass = false }) => {
  if (!glass) {
    return (
      <div
        style={{
          width: CONTINUITY.trafficLightSize,
          height: CONTINUITY.trafficLightSize,
          borderRadius: "50%",
          background: color,
        }}
      />
    );
  }
  // Glass variant: radial gradient adds a top-left highlight; inset shadow
  // sells depth at the bottom edge; outer drop-shadow softens the boundary
  // against the title bar background.
  return (
    <div
      style={{
        width: CONTINUITY.trafficLightSize,
        height: CONTINUITY.trafficLightSize,
        borderRadius: "50%",
        background: `radial-gradient(circle at 30% 30%, ${lighten(color, 0.35)}, ${color})`,
        boxShadow:
          "inset 0 -1px 1px rgba(0,0,0,0.15), 0 0.5px 1px rgba(0,0,0,0.1)",
      }}
    />
  );
};

/**
 * Lighten a 6-digit hex color by `amount` (0–1) toward white. Used by the
 * glass traffic-light dots to compute the highlight stop without baking in
 * a per-color literal.
 */
function lighten(hex: string, amount: number): string {
  const m = hex.match(/^#([0-9a-fA-F]{6})$/);
  const group = m?.[1];
  if (!group) return hex;
  const num = parseInt(group, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(lr)}${toHex(lg)}${toHex(lb)}`;
}
