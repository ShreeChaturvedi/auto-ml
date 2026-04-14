import React from "react";
import { AbsoluteFill } from "remotion";
import { DIMENSIONS, SAFE_AREA } from "../../config/layout";
import type { Theme } from "../../config/themes";
import { COLORS, getDividerGradient, getHeroGradient } from "../../config/themes";
import { EyebrowLabel } from "./EyebrowLabel";
import { SlideFooter } from "./SlideFooter";

export type SlideShellProps = {
  theme: Theme;
  /** Optional eyebrow label shown at the top of the content column. */
  eyebrow?: string;
  /** If true, layer the hero radial bloom over the background. Default false (only Title + Agenda use this). */
  gradient?: boolean;
  /** If true, render the 2px Miami-red→tan gradient divider below the eyebrow. Default true. */
  divider?: boolean;
  /** If true, render the universal institutional footer. Default true. */
  footer?: boolean;
  /**
   * @deprecated Removed in favor of header divider; will be dropped next commit.
   * Currently a no-op — retained so existing call sites still typecheck.
   */
  spine?: boolean;
  children: React.ReactNode;
};

/** Vertical gap between the eyebrow label and the title that follows it
 *  (when the divider is disabled). */
const EYEBROW_TO_TITLE_GAP = 32;
/** Vertical gap between the eyebrow and the gradient divider. */
const EYEBROW_TO_DIVIDER_GAP = 16;
/** Vertical gap between the divider and the content that follows. */
const DIVIDER_TO_CONTENT_GAP = 40;
/** Divider bar height. */
const DIVIDER_HEIGHT = 2;

/** Width of the divider bar: spans from SAFE_AREA.left to the canvas edge
 *  minus SAFE_AREA.right. */
const DIVIDER_WIDTH =
  DIMENSIONS.landscape.width - SAFE_AREA.left - SAFE_AREA.right;

/** Negative margin applied to the divider so it begins at `SAFE_AREA.left`
 *  even though its wrapping column is inset to `SAFE_AREA.contentLeft`. */
const DIVIDER_LEFT_NEGATIVE = -(SAFE_AREA.contentLeft - SAFE_AREA.left);

/**
 * Absolute-fill wrapper used by every slide in the runway.
 *
 * Layout contract:
 *   - White background (or dark for dark theme) via `COLORS[theme].BACKGROUND`
 *   - Asymmetric safe-areas: 96 / 96 / 120 / 96 (top / right / bottom / left)
 *   - Content inset: `paddingLeft: 120` (SAFE_AREA.contentLeft) — preserved so
 *     existing slides retain their horizontal positioning
 *   - Optional hero gradient wash layered between the background and content
 *   - Optional eyebrow label followed by a 2px Miami-red→tan gradient divider
 *     that spans `SAFE_AREA.left` to `canvasWidth - SAFE_AREA.right` (escapes
 *     the content-column inset via a negative `marginLeft`)
 *   - Optional institutional footer anchored to the bottom
 *
 * Absolute-positioned children (common pattern in scene slides) continue to
 * anchor against SlideShell's `<AbsoluteFill>` ancestor — unaffected by the
 * divider/footer chrome.
 */
export const SlideShell: React.FC<SlideShellProps> = ({
  theme,
  eyebrow,
  gradient = false,
  divider = true,
  footer = true,
  children,
}) => {
  const c = COLORS[theme];

  return (
    <AbsoluteFill style={{ background: c.BACKGROUND }}>
      {gradient ? (
        <AbsoluteFill
          style={{
            backgroundImage: getHeroGradient(theme),
            pointerEvents: "none",
          }}
        />
      ) : null}

      <AbsoluteFill
        style={{
          paddingTop: SAFE_AREA.top,
          paddingRight: SAFE_AREA.right,
          paddingBottom: SAFE_AREA.bottom,
          paddingLeft: SAFE_AREA.contentLeft,
          color: c.WORD_COLOR_ON_BG_APPEARED,
        }}
      >
        {eyebrow ? <EyebrowLabel theme={theme}>{eyebrow}</EyebrowLabel> : null}
        {divider ? (
          <div
            style={{
              marginTop: eyebrow ? EYEBROW_TO_DIVIDER_GAP : 0,
              marginBottom: DIVIDER_TO_CONTENT_GAP,
              marginLeft: DIVIDER_LEFT_NEGATIVE,
              width: DIVIDER_WIDTH,
              height: DIVIDER_HEIGHT,
              backgroundImage: getDividerGradient(),
              pointerEvents: "none",
            }}
          />
        ) : eyebrow ? (
          <div style={{ height: EYEBROW_TO_TITLE_GAP }} />
        ) : null}
        {children}
      </AbsoluteFill>

      {footer ? <SlideFooter theme={theme} /> : null}
    </AbsoluteFill>
  );
};
