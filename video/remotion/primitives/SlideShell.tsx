import React from "react";
import { AbsoluteFill } from "remotion";
import type { Theme } from "../../config/themes";
import { COLORS, getHeroGradient } from "../../config/themes";
import { EyebrowLabel } from "./EyebrowLabel";

export type SlideShellProps = {
  theme: Theme;
  /** Optional eyebrow label shown at the top of the content column. */
  eyebrow?: string;
  /** If true, layer the hero radial bloom over the background. Default false (only Title + Agenda use this). */
  gradient?: boolean;
  /** If true, render a 1px vertical hairline spine at left: 72px. Default true. */
  spine?: boolean;
  children: React.ReactNode;
};

/** Asymmetric safe-area: 96px top/left/right, 120px bottom for YouTube captions. */
const SAFE_AREA_TOP = 96;
const SAFE_AREA_SIDE = 96;
const SAFE_AREA_BOTTOM = 120;
/** Content inset — 120px from left edge so text starts 48px past the spine. */
const CONTENT_LEFT = 120;
/** Spine x-position. */
const SPINE_LEFT = 72;
/** Eyebrow's offset below the top safe-area. */
const EYEBROW_TOP_OFFSET = 48;

/**
 * Absolute-fill wrapper used by every slide in the runway.
 *
 * Layout contract:
 *   - White background (or dark for dark theme) via `COLORS[theme].BACKGROUND`
 *   - Asymmetric safe-areas: 96 / 96 / 120 / 96 (top / right / bottom / left)
 *   - Content inset: `paddingLeft: 120` — starts 48px past the hairline spine
 *   - Optional hero gradient wash layered between the background and content
 *   - Optional vertical spine at `left: 72px` (static `div`; slides wanting an
 *     animated draw-in use `<MotionLine>` instead)
 *   - Optional eyebrow label anchored 48px below the top safe-area edge
 */
export const SlideShell: React.FC<SlideShellProps> = ({
  theme,
  eyebrow,
  gradient = false,
  spine = true,
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

      {spine ? (
        // Static hairline spine. Color reuses `BORDER_COLOR` directly — same
        // token used by the app's `--border-subtle` visual weight.
        <div
          style={{
            position: "absolute",
            top: SAFE_AREA_TOP,
            bottom: SAFE_AREA_BOTTOM,
            left: SPINE_LEFT,
            width: 1,
            background: c.BORDER_COLOR,
          }}
        />
      ) : null}

      <AbsoluteFill
        style={{
          paddingTop: SAFE_AREA_TOP,
          paddingRight: SAFE_AREA_SIDE,
          paddingBottom: SAFE_AREA_BOTTOM,
          paddingLeft: CONTENT_LEFT,
          color: c.WORD_COLOR_ON_BG_APPEARED,
        }}
      >
        {eyebrow ? (
          <div style={{ marginBottom: EYEBROW_TOP_OFFSET - 16 }}>
            <EyebrowLabel theme={theme}>{eyebrow}</EyebrowLabel>
          </div>
        ) : null}
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
