import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SPRING_HERO, SPRING_SETTLE } from "../../../config/easing";
import {
  MONOSPACE_FONT,
  SERIF_FONT,
  TITLE_FONT,
} from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS, INSTITUTIONAL } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { AnimatedLogoMark } from "../../primitives/AnimatedLogoMark";
import { FlourishUnderline } from "../../primitives/FlourishUnderline";
import { SlideShell } from "../../primitives/SlideShell";
import type { SlideBodyProps } from "./index";

/**
 * ThankYouSlide — presenter-mode bookend (7s / 420f).
 *
 * Standalone terminal card for the live expo deck. Visual language is lifted
 * from ClosingSlide (per-char SPRING_HERO rise, Miami-red flourish, serif +
 * monospace typography) but stripped of the 5-phase cross-transforms and
 * full-canvas wordmark reveal. Presenter mode advances manually via arrow
 * keys, so there's no narrative payoff to build toward — just the final
 * "thank you, here are the links, take a question" posture.
 *
 * Composition (top to bottom):
 *   - AnimatedLogoMark (120) + "Agentic AutoML Platform" wordmark — static
 *   - "Thank you." — SERIF 140, per-char SPRING_HERO stagger, f=12 start
 *   - FlourishUnderline (Miami red, w=4, h=52) — draws once, holds
 *   - "Questions?" — SERIF 56, greyed, fadeIn delay=90
 *   - `agentic-automl.vercel.app` — MONOSPACE 28 with ↗ bullet, delay=120
 */

// Frame budget: the slide holds 420f (7s). All animations complete by ~f=200,
// leaving a ~220f hold on the full composition. Plenty of room for the
// presenter to land the beat and field questions without re-triggering it.

// --- Wordmark band (static) ----------------------------------------------- //

const WORDMARK_Y = 300;
const WORDMARK_MARK_SIZE = 120;
const WORDMARK_TEXT = "Agentic AutoML Platform";
const WORDMARK_TEXT_FONT_SIZE = 64;
const WORDMARK_TEXT_LETTER_SPACING = "-0.030em";
const WORDMARK_MARK_TO_TEXT_GAP = 4;

// --- "Thank you." (hero line) --------------------------------------------- //

const THANK_YOU_CHARS = "Thank you.".split("");
const THANK_YOU_Y = 540;
const THANK_YOU_FONT_SIZE = 140;
const THANK_YOU_START_FRAME = 12;
const THANK_YOU_CHAR_STEP = 3;
const THANK_YOU_CHAR_DURATION = 18;
const THANK_YOU_TRANSLATE = 18;

// --- Flourish ------------------------------------------------------------- //

const FLOURISH_DELAY = 60;
const FLOURISH_HEIGHT = 52;
const FLOURISH_STROKE_WIDTH = 4;

// --- "Questions?" --------------------------------------------------------- //

const QUESTIONS_Y = 760;
const QUESTIONS_FONT_SIZE = 56;
const QUESTIONS_DELAY = 90;

// --- Action link ---------------------------------------------------------- //

const LINK_Y = 860;
const LINK_URL = "agentic-automl.vercel.app";
const LINK_URL_FONT_SIZE = 28;
const LINK_BULLET_FONT_SIZE = 38;
const LINK_BULLET_TO_URL_GAP = 14;
const LINK_UNDERLINE_OFFSET = 5;
const LINK_UNDERLINE_THICKNESS = 1;
const LINK_DELAY = 120;

/**
 * AnimatedLogoMark's SVG has empty space below its visual "A" baseline. To
 * center the mark optically alongside inline-baseline text, shift it down by
 * this fraction of its rendered size via `verticalAlign`. The constant
 * matches the ratio used by ClosingSlide's WordmarkRevealLayer.
 */
const MARK_VISUAL_BASELINE_VIEWBOX_Y = 26.5;
const MARK_VIEWBOX_SIZE = 32;
const MARK_BASELINE_BOTTOM_OFFSET_RATIO =
  (MARK_VIEWBOX_SIZE - MARK_VISUAL_BASELINE_VIEWBOX_Y) / MARK_VIEWBOX_SIZE;

// ============================================================================
// Component
// ============================================================================

export const ThankYouSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  return (
    <SlideShell theme={theme} gradient divider={false} footer>
      {/* Escape SlideShell's `paddingLeft: 120` content inset so centered
       *  composition can use raw canvas coordinates. */}
      <AbsoluteFill
        style={{
          paddingLeft: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <WordmarkBand theme={theme} />
        <ThankYouHeroLine theme={theme} />
        <QuestionsLine theme={theme} />
        <LinkLine theme={theme} />
      </AbsoluteFill>
    </SlideShell>
  );
};
// ============================================================================
// Wordmark band — `A` mark + "Agentic AutoML Platform" (static, visible f=0)
// ============================================================================

const WordmarkBand: React.FC<{ theme: Theme }> = ({ theme }) => {
  const c = COLORS[theme];
  const markVerticalAlign =
    -MARK_BASELINE_BOTTOM_OFFSET_RATIO * WORDMARK_MARK_SIZE;

  return (
    <div
      style={{
        position: "absolute",
        top: WORDMARK_Y,
        left: 0,
        right: 0,
        textAlign: "center",
        whiteSpace: "nowrap",
        // Eliminate the inline whitespace between mark + text spans so
        // `WORDMARK_MARK_TO_TEXT_GAP` controls the exact spacing.
        fontSize: 0,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: WORDMARK_MARK_SIZE,
          height: WORDMARK_MARK_SIZE,
          verticalAlign: `${markVerticalAlign}px`,
        }}
      >
        <AnimatedLogoMark
          size={WORDMARK_MARK_SIZE}
          theme={theme}
          mode="static"
          variant="simple"
        />
      </span>
      <span
        style={{
          display: "inline-block",
          verticalAlign: "baseline",
          marginLeft: WORDMARK_MARK_TO_TEXT_GAP,
          ...TITLE_FONT,
          // Weight 400 to match the 2.5px-stroked A mark's optical weight.
          fontWeight: 400,
          fontSize: WORDMARK_TEXT_FONT_SIZE,
          letterSpacing: WORDMARK_TEXT_LETTER_SPACING,
          lineHeight: 1.05,
          color: c.WORD_COLOR_ON_BG_APPEARED,
        }}
      >
        {WORDMARK_TEXT}
      </span>
    </div>
  );
};

// ============================================================================
// "Thank you." per-char SPRING_HERO rise + anchored flourish underline
// ============================================================================

const ThankYouHeroLine: React.FC<{ theme: Theme }> = ({ theme }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: THANK_YOU_Y,
        left: 0,
        right: 0,
        textAlign: "center",
      }}
    >
      <div style={{ position: "relative", display: "inline-block" }}>
        <ThankYouHeadline theme={theme} />
        <FlourishUnderline
          delay={FLOURISH_DELAY}
          drawOut={false}
          strokeWidth={FLOURISH_STROKE_WIDTH}
          color={INSTITUTIONAL.MIAMI_RED}
          style={{
            position: "absolute",
            top: "calc(100% - 2px)",
            left: 0,
            width: "100%",
            height: FLOURISH_HEIGHT,
          }}
        />
      </div>
    </div>
  );
};

const ThankYouHeadline: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = COLORS[theme];

  return (
    <div
      style={{
        ...SERIF_FONT,
        fontSize: THANK_YOU_FONT_SIZE,
        letterSpacing: "-0.015em",
        lineHeight: 1.15,
        color: c.WORD_COLOR_ON_BG_APPEARED,
      }}
    >
      {THANK_YOU_CHARS.map((ch, i) => {
        const charStart = THANK_YOU_START_FRAME + i * THANK_YOU_CHAR_STEP;
        const progress = spring({
          fps,
          frame: frame - charStart,
          config: SPRING_HERO,
          durationInFrames: THANK_YOU_CHAR_DURATION,
        });
        const opacity = interpolate(progress, [0, 1], [0, 1]);
        const translateY = interpolate(
          progress,
          [0, 1],
          [THANK_YOU_TRANSLATE, 0],
        );
        // Non-breaking space — otherwise the browser collapses whitespace
        // text nodes and the glyph skips the stagger.
        const glyph = ch === " " ? "\u00A0" : ch;
        return (
          <span
            key={`${ch}-${i}`}
            style={{
              display: "inline-block",
              opacity,
              transform: `translateY(${translateY}px)`,
            }}
          >
            {glyph}
          </span>
        );
      })}
    </div>
  );
};

// ============================================================================
// "Questions?" — greyed serif, subtle fade-in
// ============================================================================

const QuestionsLine: React.FC<{ theme: Theme }> = ({ theme }) => {
  const c = COLORS[theme];
  const fade = useFadeIn({
    delay: QUESTIONS_DELAY,
    translateY: 10,
    damping: SPRING_SETTLE.damping,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: QUESTIONS_Y,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: fade.opacity,
        transform: fade.transform,
      }}
    >
      <div
        style={{
          ...SERIF_FONT,
          fontSize: QUESTIONS_FONT_SIZE,
          letterSpacing: "-0.01em",
          lineHeight: 1.2,
          color: c.WORD_COLOR_ON_BG_GREYED,
        }}
      >
        Questions?
      </div>
    </div>
  );
};

// ============================================================================
// Action link — ↗ bullet + underlined URL, centered
// ============================================================================

const LinkLine: React.FC<{ theme: Theme }> = ({ theme }) => {
  const c = COLORS[theme];
  const fade = useFadeIn({
    delay: LINK_DELAY,
    translateY: 8,
    damping: SPRING_SETTLE.damping,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: LINK_Y,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: fade.opacity,
        transform: fade.transform,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: LINK_BULLET_TO_URL_GAP,
        }}
      >
        <span
          style={{
            ...MONOSPACE_FONT,
            fontSize: LINK_BULLET_FONT_SIZE,
            lineHeight: 1,
            color: INSTITUTIONAL.MIAMI_RED,
            display: "inline-block",
          }}
        >
          ↗
        </span>
        <span
          style={{
            ...MONOSPACE_FONT,
            fontSize: LINK_URL_FONT_SIZE,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            letterSpacing: "-0.01em",
            fontVariantNumeric: "tabular-nums",
            textDecorationLine: "underline",
            textDecorationThickness: LINK_UNDERLINE_THICKNESS,
            textUnderlineOffset: LINK_UNDERLINE_OFFSET,
            textDecorationColor: c.WORD_COLOR_ON_BG_APPEARED,
          }}
        >
          {LINK_URL}
        </span>
      </div>
    </div>
  );
};
