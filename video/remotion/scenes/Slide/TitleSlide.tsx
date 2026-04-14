import React from "react";
import { AbsoluteFill } from "remotion";
import { SPRING_SETTLE } from "../../../config/easing";
import { REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import { SAFE_AREA } from "../../../config/layout";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { AnimatedLogoMark } from "../../primitives/AnimatedLogoMark";
import { MiamiMark } from "../../primitives/MiamiMark";
import { SlideShell } from "../../primitives/SlideShell";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/**
 * 6-phase frame budget (60fps). Sum = 540 = 9s.
 *
 *   1. 0–15    Hero gradient bloom (SlideShell static; handled by SlideShell)
 *   2. 15–95   Product "A" builds (24 + 24 + 24 + 10 frames internally)
 *   3. 95–155  Wordmark settle
 *   4. 155–215 Tagline settle
 *   5. 215–275 Meta line + Miami mark fade-in
 *   6. 275–540 Hold
 */
const PHASES = [15, 80, 60, 60, 60, 265] as const;

type SixPhases = [
  PhaseInfo, // p1 — gradient
  PhaseInfo, // p2 — logo mark
  PhaseInfo, // p3 — wordmark
  PhaseInfo, // p4 — tagline
  PhaseInfo, // p5 — meta line + Miami
  PhaseInfo, // p6 — hold
];

const LOGO_SIZE = 256;
const MIAMI_MARK_SIZE = 32;
const WORDMARK_FONT_SIZE = 120;
const TAGLINE_FONT_SIZE = 34;
const META_FONT_SIZE = 14;

/**
 * TitleSlide — brand reveal (9s / 540f).
 *
 * The only slide where both the product "A" mark and the Miami institutional
 * mark perform. The product mark is the ONLY element that performs a draw
 * animation; the Miami M fades in quietly as institutional chrome. No element
 * carries solid ACCENT_COLOR — brand ambience comes from the 6% blue hero
 * gradient laid down by `SlideShell`.
 */
export const TitleSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const [, pLogo, pWordmark, pTagline, pMeta] = useTimeline([...PHASES]) as SixPhases;
  const c = COLORS[theme];

  // Phase 3 — wordmark settle. Single spring, no letter-spacing interpolation.
  const wordmarkFade = useFadeIn({
    translateY: 16,
    damping: SPRING_SETTLE.damping,
    delay: pWordmark.start,
  });

  // Phase 4 — tagline settle.
  const taglineFade = useFadeIn({
    translateY: 8,
    damping: SPRING_SETTLE.damping,
    delay: pTagline.start,
  });

  // Phase 5 — meta line fade-in. Miami mark has its own internal fade-in.
  const metaFade = useFadeIn({ translateY: 4, delay: pMeta.start });

  return (
    <SlideShell theme={theme} gradient>
      {/* Absolute-fill wrapper breaks out of SlideShell's `paddingLeft` inset so
       *  the centered composition ignores the left content column. */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 0,
          pointerEvents: "none",
        }}
      >
        {/* Product "A" mark — dual-technique draw + spring apex. */}
        <AnimatedLogoMark
          size={LOGO_SIZE}
          delay={pLogo.start}
          theme={theme}
          mode="draw"
          color={c.WORD_COLOR_ON_BG_APPEARED}
        />

        {/* Wordmark — Plus Jakarta 700, 120px, -0.025em tracking, no-wrap.
         *  Total width ≈ 1390px, inside 1728px usable canvas. */}
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

        {/* Tagline — Instrument Serif 400, 34px, center-aligned, capped width. */}
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

      {/* Meta line — bottom-center. Plus Jakarta 500 uppercase, 14px tracking-wider.
       *  NOT EyebrowLabel (which forces weight 600). Miami M replaces the word
       *  "MIAMI UNIVERSITY" — the mark IS the acknowledgement. */}
      <div
        style={{
          position: "absolute",
          bottom: SAFE_AREA.bottom + 16,
          left: "50%",
          transform: `translateX(-50%) ${metaFade.transform}`,
          opacity: metaFade.opacity,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <MiamiMark size={MIAMI_MARK_SIZE} delay={pMeta.start} />
        <div
          style={{
            ...REGULAR_FONT,
            fontWeight: 500,
            fontSize: META_FONT_SIZE,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: c.WORD_COLOR_ON_BG_GREYED,
            lineHeight: 1.2,
          }}
        >
          CSE 449 Senior Design Capstone · April 2026
        </div>
      </div>
    </SlideShell>
  );
};
