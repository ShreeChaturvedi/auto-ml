import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT } from "../../config/fonts";
import { SAFE_AREA } from "../../config/layout";
import type { Theme } from "../../config/themes";
import { COLORS } from "../../config/themes";
import { AnimatedLogoMark } from "./AnimatedLogoMark";
import { MiamiMark } from "./MiamiMark";

export type SlideFooterProps = {
  theme: Theme;
  /** Delay before footer fades in. Default 0 (visible from first frame). */
  delay?: number;
  /** Optional page number string (e.g., "03 / 07"). Rendered bottom-left
   *  in Monaspace Neon. Omit on title-style slides (Hook, Title). */
  pageNumber?: string;
};

/** Fade-in duration for the entire footer (both marks + text fade together). */
const FADE_DURATION_FRAMES = 20;
const MARK_SIZE = 24;
const MARK_TO_TEXT_GAP = 8;
const GROUP_TO_PIPE_GAP = 24;
const PIPE_HEIGHT = 16;
const FOOTER_BOTTOM_OFFSET = 32;
const TEXT_SIZE = 14;

/**
 * Universal slide footer — institutional chrome rendered on every slide.
 *
 * Layout:
 *   [pageNumber]                       [A mark] AutoML | [Miami M] Miami University
 *   bottom-left (optional)                                       bottom-right
 *
 * Typography: Plus Jakarta 500, 14px, 0.02em tracking, WORD_COLOR_ON_BG_GREYED.
 * Page number: Monaspace Neon, 14px, tabular-nums, same color.
 *
 * Motion: opacity 0 → 1 over 20f with EASE_OUT starting at `delay`. No per-
 *   element stagger — left + right fade together. The A mark uses static
 *   mode (no draw animation); the Miami M's internal fade is aligned with the
 *   footer's `delay` so the two animate in unison.
 */
export const SlideFooter: React.FC<SlideFooterProps> = ({
  theme,
  delay = 0,
  pageNumber,
}) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const opacity = interpolate(
    frame,
    [delay, delay + FADE_DURATION_FRAMES],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const textStyle: React.CSSProperties = {
    ...REGULAR_FONT,
    fontWeight: 500,
    fontSize: TEXT_SIZE,
    letterSpacing: "0.02em",
    color: c.WORD_COLOR_ON_BG_GREYED,
    lineHeight: 1.2,
    marginLeft: MARK_TO_TEXT_GAP,
  };

  return (
    <>
      {pageNumber ? (
        <div
          style={{
            position: "absolute",
            bottom: FOOTER_BOTTOM_OFFSET,
            left: SAFE_AREA.left,
            ...MONOSPACE_FONT,
            fontSize: TEXT_SIZE,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.08em",
            color: c.WORD_COLOR_ON_BG_GREYED,
            lineHeight: 1.2,
            opacity,
            pointerEvents: "none",
          }}
        >
          {pageNumber}
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          bottom: FOOTER_BOTTOM_OFFSET,
          right: SAFE_AREA.right,
          display: "flex",
          alignItems: "center",
          opacity,
          pointerEvents: "none",
        }}
      >
        <AnimatedLogoMark
          size={MARK_SIZE}
          theme={theme}
          mode="static"
          color={c.WORD_COLOR_ON_BG_GREYED}
        />
        <div style={textStyle}>AutoML</div>
        <div
          style={{
            width: 1,
            height: PIPE_HEIGHT,
            background: c.BORDER_COLOR,
            opacity: 0.4,
            marginLeft: GROUP_TO_PIPE_GAP,
            marginRight: GROUP_TO_PIPE_GAP,
          }}
        />
        <MiamiMark size={MARK_SIZE} delay={delay} />
        <div style={textStyle}>Miami University</div>
      </div>
    </>
  );
};
