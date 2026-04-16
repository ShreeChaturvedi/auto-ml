import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { SPRING_SETTLE } from "../../../config/easing";
import { SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import { SAFE_AREA } from "../../../config/layout";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { AnimatedLogoMark } from "../../primitives/AnimatedLogoMark";
import { SlideShell } from "../../primitives/SlideShell";
import type { SlideBodyProps } from "./index";

/**
 * TitleSlide — brand reveal (9s / 540f).
 *
 * Overlapping entry cadence (all delays in frames):
 *   - Logo draw:     starts at  5, completes ~47 (42f internal, 2× faster than v1)
 *   - Wordmark:      starts at 25 (while logo's right leg is drawing)
 *   - Tagline:       starts at 45 (right as apex lands)
 *   - CSE lockup:    starts at 70
 *   - Hold:          ~95 → 540
 *
 * The only slide where both the product "A" mark and the institutional Miami
 * CSE lockup appear. The product mark is the ONLY element that performs a
 * draw animation; the CSE lockup fades in quietly as institutional chrome.
 * No element carries solid ACCENT_COLOR — brand ambience comes from the 6%
 * blue hero gradient laid down by `SlideShell`.
 */
const LOGO_DELAY = 5;
const WORDMARK_DELAY = 25;
const TAGLINE_DELAY = 45;
const META_DELAY = 70;

const LOGO_SIZE = 256;
const CSE_LOGO_SIZE = 160;
const WORDMARK_FONT_SIZE = 120;
const TAGLINE_FONT_SIZE = 44;

export const TitleSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const c = COLORS[theme];

  const wordmarkFade = useFadeIn({
    translateY: 16,
    damping: SPRING_SETTLE.damping,
    delay: WORDMARK_DELAY,
  });

  const taglineFade = useFadeIn({
    translateY: 8,
    damping: SPRING_SETTLE.damping,
    delay: TAGLINE_DELAY,
  });

  const metaFade = useFadeIn({ translateY: 4, delay: META_DELAY });

  return (
    <SlideShell theme={theme} gradient>
      {/* Absolute-fill wrapper breaks out of SlideShell's `paddingLeft` inset
       *  so the centered composition ignores the left content column. */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 0,
          pointerEvents: "none",
        }}
      >
        <AnimatedLogoMark
          size={LOGO_SIZE}
          delay={LOGO_DELAY}
          theme={theme}
          mode="draw"
          color={c.WORD_COLOR_ON_BG_APPEARED}
        />

        <div
          style={{
            ...TITLE_FONT,
            fontSize: WORDMARK_FONT_SIZE,
            letterSpacing: "-0.025em",
            whiteSpace: "nowrap",
            color: c.WORD_COLOR_ON_BG_APPEARED,
            lineHeight: 1.05,
            marginTop: 48,
            opacity: wordmarkFade.opacity,
            transform: wordmarkFade.transform,
          }}
        >
          Agentic AutoML Platform
        </div>

        <div
          style={{
            ...SERIF_FONT,
            fontSize: TAGLINE_FONT_SIZE,
            letterSpacing: "0em",
            textAlign: "center",
            maxWidth: 1200,
            color: c.WORD_COLOR_ON_BG_GREYED,
            lineHeight: 1.3,
            marginTop: 28,
            opacity: taglineFade.opacity,
            transform: taglineFade.transform,
          }}
        >
          AI-augmented automation for the full ML workflow — with humans in every loop.
        </div>
      </AbsoluteFill>

      {/* Institutional lockup — bottom-center. Unified Miami CSE logo (block M +
       *  "College of Engineering and Computing" + "Department of Computer Science
       *  and Software Engineering"). Single image asset keeps the CSE attribution
       *  typographically consistent with official department branding. */}
      <div
        style={{
          position: "absolute",
          bottom: SAFE_AREA.bottom + 16,
          left: "50%",
          transform: `translateX(-50%) ${metaFade.transform}`,
          opacity: metaFade.opacity,
        }}
      >
        <Img
          src={staticFile("branding/miami-cse-logo.jpeg")}
          style={{
            height: CSE_LOGO_SIZE,
            width: "auto",
            display: "block",
          }}
        />
      </div>
    </SlideShell>
  );
};
