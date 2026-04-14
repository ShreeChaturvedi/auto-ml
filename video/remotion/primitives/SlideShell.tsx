import React from "react";
import { AbsoluteFill } from "remotion";
import { SAFE_AREA } from "../../config/layout";
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

/** Vertical gap between the eyebrow label and the title that follows it. */
const EYEBROW_TO_TITLE_GAP = 32;

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
 *   - Optional eyebrow label with a 32px gap before the title that follows it
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
            top: SAFE_AREA.top,
            bottom: SAFE_AREA.bottom,
            left: SAFE_AREA.spineLeft,
            width: 1,
            background: c.BORDER_COLOR,
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
        {eyebrow ? (
          <div style={{ marginBottom: EYEBROW_TO_TITLE_GAP }}>
            <EyebrowLabel theme={theme}>{eyebrow}</EyebrowLabel>
          </div>
        ) : null}
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
