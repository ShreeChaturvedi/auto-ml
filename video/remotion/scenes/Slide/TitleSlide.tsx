import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { SPRING_SETTLE } from "../../../config/easing";
import { REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import { SAFE_AREA } from "../../../config/layout";
import { COLORS, INSTITUTIONAL } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { AnimatedLogoMark } from "../../primitives/AnimatedLogoMark";
import { CaptionPipe } from "../../primitives/CaptionPipe";
import { MiamiRedStreaks } from "../../primitives/MiamiRedStreaks";
import { SlideShell } from "../../primitives/SlideShell";
import type { SlideBodyProps } from "./index";

/**
 * TitleSlide — brand reveal (9s / 540f).
 *
 * Entry cadence (all delays in frames):
 *   - Logo draw:     starts at  5, completes ~47 (42f internal)
 *   - Wordmark:      starts at 25 (while logo's right leg is drawing)
 *   - Tagline:       starts at 45 (right as apex lands)
 *   - CSE lockup:    starts at 70 (image, hairline, caption fade together)
 *   - Red streaks:   ride in with the draw, wash away by ~f=265
 *   - Hold:          ~265 → 540  (clean, only the static hairline carries red)
 *
 * Visual logic: Miami red is used as a diminishing accent. A burst of thin
 * red streaks sweeps across the frame during the reveal, then dissipates;
 * the only red left at rest is the 2 px hairline binding the CSE logo to
 * its caption. The animated product mark and the institutional lockup are
 * the two elements the eye rests on; everything else supports them.
 */
const LOGO_DELAY = 5;
const WORDMARK_DELAY = 25;
const TAGLINE_DELAY = 45;
const META_DELAY = 70;

const LOGO_SIZE = 256;
const CSE_LOGO_SIZE = 240;
const WORDMARK_FONT_SIZE = 120;
const TAGLINE_FONT_SIZE = 46;
const CAPTION_FONT_SIZE = 24;

const LOCKUP_INTERNAL_GAP = 18; // between logo & hairline and hairline & caption
const HAIRLINE_WIDTH = 300;
const HAIRLINE_HEIGHT = 2;

/** Tagline color — slightly darker than the default greyed text so the
 *  serif tagline holds its own against the wordmark without looking ghosted. */
const TAGLINE_COLOR = "rgba(23, 23, 23, 0.75)";
/** Caption color — kept meaningfully fainter than the tagline to preserve
 *  the descending 120→46→15 visual ladder. */
const CAPTION_COLOR = "rgba(23, 23, 23, 0.62)";

/** Shift the centered stack up so the institutional lockup has clear room
 *  below the tagline. Sized for the 46-px tagline and 240-px CSE logo plus
 *  24-px caption — the lockup is ~320 px tall end-to-end. */
const STACK_TRANSLATE_Y = -170;

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
    <SlideShell theme={theme} gradient divider={false} footer={false}>
      {/* Miami-red streak burst — rides in with the logo draw, washes away
       *  before the 9-second hold settles. Deterministic; see
       *  MiamiRedStreaks.DEFAULT_STREAKS for the schedule. */}
      <MiamiRedStreaks />

      {/* Absolute-fill wrapper breaks out of SlideShell's `paddingLeft` inset
       *  so the centered composition ignores the left content column. The
       *  translateY lifts the stack to make room for the bottom lockup. */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 0,
          pointerEvents: "none",
          transform: `translateY(${STACK_TRANSLATE_Y}px)`,
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
            maxWidth: 1400,
            color: TAGLINE_COLOR,
            lineHeight: 1.3,
            marginTop: 28,
            opacity: taglineFade.opacity,
            transform: taglineFade.transform,
          }}
        >
          From dataset to deployed models, agentically and autonomously.
        </div>
      </AbsoluteFill>

      {/* Institutional lockup — bottom-center. Unified Miami CSE logo (block
       *  M + "College of Engineering and Computing" + "Department of Computer
       *  Science and Software Engineering") with a Miami-red hairline and a
       *  Plus Jakarta Sans all-caps caption below. The hairline uses the same
       *  red as the streaks so the opening burst resolves into a single static
       *  mark. All three elements share one fade so they enter as one lockup. */}
      <div
        style={{
          position: "absolute",
          bottom: SAFE_AREA.bottom,
          left: "50%",
          transform: `translateX(-50%) ${metaFade.transform}`,
          opacity: metaFade.opacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
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
        <div
          style={{
            marginTop: LOCKUP_INTERNAL_GAP,
            width: HAIRLINE_WIDTH,
            height: HAIRLINE_HEIGHT,
            backgroundImage: `linear-gradient(to right, rgba(196,18,48,0) 0%, ${INSTITUTIONAL.MIAMI_RED} 50%, rgba(196,18,48,0) 100%)`,
          }}
        />
        <div
          style={{
            ...REGULAR_FONT,
            marginTop: LOCKUP_INTERNAL_GAP,
            fontSize: CAPTION_FONT_SIZE,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: CAPTION_COLOR,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span>CSE 449</span>
          <CaptionPipe />
          <span>Senior Design Project</span>
          <CaptionPipe />
          <span>2026</span>
        </div>
      </div>
    </SlideShell>
  );
};
