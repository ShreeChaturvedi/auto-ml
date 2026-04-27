import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  EASE_IN,
  EASE_IN_OUT,
  EASE_OUT,
  SPRING_HERO,
  SPRING_SETTLE,
} from "../../../config/easing";
import {
  MONOSPACE_FONT,
  REGULAR_FONT,
  SERIF_FONT,
  TITLE_FONT,
} from "../../../config/fonts";
import { DIMENSIONS } from "../../../config/layout";
import type { Theme } from "../../../config/themes";
import { COLORS, INSTITUTIONAL } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { AnimatedLogoMark } from "../../primitives/AnimatedLogoMark";
import { FlourishUnderline } from "../../primitives/FlourishUnderline";
import { SlideShell } from "../../primitives/SlideShell";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { SlideBodyProps } from "./index";

/**
 * ClosingSlide — "Thank you." bookend (13.5s / 810f).
 *
 * Five-phase narrative arc:
 *   Phase 1 (0-180)   Provocation  — SVG (320px) at center + brand-voice headline
 *   Phase 2 (180-330) Turn         — headline exits reverse-staggered, SVG shrinks
 *                                    320→160 and translates up −245, "Thank you."
 *                                    letters spring in (SPRING_HERO — the signature
 *                                    emotional moment, used exactly once)
 *   Phase 3 (330-570) Gratitude    — tagline + stacked plain links + curly
 *                                    hand-drawn flourish under "Thank you."
 *   Phase 4 (570-690) Hold         — ambient micro-motion (arrow pulse, SVG breath)
 *   Phase 5 (690-810) Wordmark    — A slides left + shrinks to become the "A" in
 *                                    "Agentic AutoML Platform"; "gentic AutoML Platform"
 *                                    reveals character-by-character to the right
 *                                    (reveal begins while the A is still sliding).
 *
 * Why not extend EndCard: EndCard is a single-phase fade; ClosingSlide is a 5-phase
 * narrative with cross-phase transforms — structurally incompatible.
 *
 * Why SlideShell's default footer (not TitleSlide's 302px CSE lockup): combining
 * the lockup with Phase 3's 650px vertical stack overlaps by ~200px. The default
 * `SlideFooter` already renders [A mark] AutoML | [Miami M] Miami University, so
 * institutional identity is preserved while freeing the full 864px usable height.
 */

// ============================================================================
// Phase boundaries (all frames @ 60fps)
//
//   Phase 1 : 0   → 180   (Provocation)
//   Phase 2 : 180 → 330   (Turn)
//   Phase 3 : 330 → 570   (Gratitude)
//   Phase 4 : 570 → 690   (Hold)
//   Phase 5 : 690 → 810   (Wordmark reveal)
//
// Only PHASE3_END is referenced directly (it anchors the ambient-motion
// origin); the other boundaries emerge from individual element timings
// below — kept here as documentation of the narrative arc.
// ============================================================================

const PHASE3_END = 570;

// ============================================================================
// SVG transform — derived from Phase 3 stack math (NOT guessed)
// ============================================================================

const CANVAS_CENTER_Y = DIMENSIONS.landscape.height / 2; // 540
/** Phase 3 stack — shrunk after switching from boxed action cards to stacked
 *  plain links (cards were ~112px, links are ~2×32 + gap ≈ 82px). Re-centering
 *  the stack keeps equal slack above and below the composition. */
const PHASE3_STACK_HEIGHT = 620;
const PHASE3_STACK_TOP = CANVAS_CENTER_Y - PHASE3_STACK_HEIGHT / 2; // 230
const SVG_PHASE1_SIZE = 320;
const SVG_PHASE3_SIZE = 160;
const SVG_PHASE3_CENTER_Y = PHASE3_STACK_TOP + SVG_PHASE3_SIZE / 2; // 310
/** Derived vertical offset from canvas center to Phase-3 SVG center. */
const SVG_TRANSLATE_Y = SVG_PHASE3_CENTER_Y - CANVAS_CENTER_Y; // −230

// ============================================================================
// Phase 1 — Provocation timing
// ============================================================================

const SVG_ENTER_DELAY = 5;
const PROVOCATION_WORDS = ["Stop", "babysitting", "your", "notebooks."] as const;
const PROVOCATION_WORD_COUNT = PROVOCATION_WORDS.length;
const PROVOCATION_STAGGER_START = 25;
const PROVOCATION_STAGGER_STEP = 15;
const SUPPORT_FADE_IN_DELAY = 80;

// ============================================================================
// Phase 2 — Turn timing
// ============================================================================

const SUPPORT_FADE_OUT_START = 180;
const SUPPORT_FADE_OUT_DURATION = 30;

const PROVOCATION_EXIT_BASE_FRAME = 185;
const PROVOCATION_EXIT_STEP = 12; // reverse stagger: last word first
const PROVOCATION_EXIT_DURATION = 20;
const PROVOCATION_EXIT_TRANSLATE = -10;

const SVG_MORPH_START = 200;
const SVG_MORPH_END = 260;
const SVG_SETTLE_BUMP_START = 260;
const SVG_SETTLE_BUMP_MID = 267;
const SVG_SETTLE_BUMP_END = 275;
const SVG_SETTLE_BUMP_PEAK = 0.04;

const THANK_YOU_CHARS = "Thank you.".split("");
const THANK_YOU_START_FRAME = 230;
const THANK_YOU_CHAR_STEP = 3;
const THANK_YOU_CHAR_DURATION = 18;
const THANK_YOU_TRANSLATE = 16;

// ============================================================================
// Phase 3 — Gratitude timing
// ============================================================================

const TAGLINE_DELAY = 360;
const LINK_1_DELAY = 400;
const LINK_2_DELAY = 420;

// --- Curly hand-drawn flourish under "Thank you." ------------------------- //
// Draw begins ~30f after "Thank you." completes its letter rise (last char
// spring settles around f=260), leaving a beat of held text before the
// flourish arrives — then the flourish holds for the remainder of the slide.
// "Thank you." is at fontSize 112 (~2.15× HookSlide's 52), so the flourish
// is scaled up proportionally: height 52 (vs HookSlide's 18) and strokeWidth
// 4 (vs the primitive's default 2.5) so it reads with the same visual weight.
const THANK_YOU_FLOURISH_DELAY = 290;
const THANK_YOU_FLOURISH_HEIGHT = 52;
const THANK_YOU_FLOURISH_STROKE_WIDTH = 3.6;

// ============================================================================
// Phase 4 — Hold (ambient)
// ============================================================================

const PHASE4_START = PHASE3_END; // 570
const ARROW_PULSE_PERIOD_FRAMES = 30; // ~1s period at 60fps
const ARROW_PULSE_AMPLITUDE = 2; // px
const SVG_BREATH_PERIOD_FRAMES = 45; // ~4.7s period — calm, not nervous
const SVG_BREATH_AMPLITUDE = 0.01;

// ============================================================================
// Phase 5 — Wordmark reveal (A slides in, text reveals character-by-character)
// ============================================================================

const PHASE5_START = 690;
/** End of the A slide + shrink animation. */
const PHASE5_SLIDE_END = 730;
/** Text reveal begins 10f into the slide so the "g" fades in while the A is
 *  still travelling — continuous, not sequential. Last char starts at
 *  700 + 21*2 = 742 and fully lands at 742 + 18 = 760, leaving a ~50f
 *  (0.83s) hold on the complete wordmark before the slide ends at 810. */
const PHASE5_TEXT_REVEAL_START = 700;
/** Frames between consecutive character reveals. */
const PHASE5_TEXT_CHAR_STEP = 2;
/** Per-character fade+rise duration (frames). */
const PHASE5_TEXT_CHAR_DURATION = 18;

// Wordmark geometry
/** Final size of the A mark after the shrink. Matches Plus Jakarta's cap-height
 *  at fontSize 120 (0.802 × 110 ≈ 88px, slightly taller than text cap-height
 *  86px — logo reads as the dominant first letter of the wordmark). */
const WORDMARK_MARK_FINAL_SIZE = 100;
const WORDMARK_TEXT = "gentic AutoML Platform";
/** Matches TitleSlide's wordmark exactly — this is the opening bookend. */
const WORDMARK_TEXT_FONT_SIZE = 88;
const WORDMARK_TEXT_LETTER_SPACING = "-0.030em";
/** Widen word gaps to compensate for the tight letter spacing — without this,
 *  the spaces in "gentic AutoML Platform" read as cramped character breaks
 *  rather than word boundaries. */
const WORDMARK_TEXT_WORD_SPACING = "0.08em";
const WORDMARK_TEXT_LINE_HEIGHT = 1.05;
/** Gap between the mark and the text's first character ("g"). Tight — we want
 *  the mark to feel like an integrated letter, not a separated icon. */
const WORDMARK_MARK_TO_TEXT_GAP = 2;
/** Top Y (canvas coordinates) of the auto-centered wordmark wrapper. The
 *  wrapper centers itself horizontally on canvas via `textAlign: center` +
 *  inline-block children, so no hardcoded X coordinate is needed — horizontal
 *  positioning is computed by CSS from the actual rendered mark + text widths.
 *  The wrapper sits with its top at y=230 so that at Phase 5 start (mark size
 *  160, no visible text), the mark aligns with its Phase 3/4 resting position
 *  (center at canvas y=310). */
const WORDMARK_WRAPPER_TOP = 230;

// ============================================================================
// Phase 1 stack geometry — SVG anchored at canvas center, text sits below
// ============================================================================

const PHASE1_SVG_TO_HEADLINE_GAP = 48;
const PHASE1_HEADLINE_TO_SUPPORT_GAP = 30;
/** Top of Phase 1 headline — below the 320px SVG at y=540. */
const PHASE1_HEADLINE_TOP =
  CANVAS_CENTER_Y + SVG_PHASE1_SIZE / 2 + PHASE1_SVG_TO_HEADLINE_GAP;
/** Approx headline box height @ 82px serif × 1.15 line-height. */
const PHASE1_HEADLINE_BOX_HEIGHT = 95;
/** Top of Phase 1 support copy. */
const PHASE1_SUPPORT_TOP =
  PHASE1_HEADLINE_TOP +
  PHASE1_HEADLINE_BOX_HEIGHT +
  PHASE1_HEADLINE_TO_SUPPORT_GAP;

// ============================================================================
// Phase 3 stack geometry — top aligns to PHASE3_STACK_TOP, SVG owns top 160px,
// remaining elements stack below with the documented gaps.
// ============================================================================

const PHASE3_CONTENT_WIDTH = 960;
const PHASE3_SVG_TO_THANKYOU_GAP = 40;
/** y of the "Thank you." top — below Phase-3 SVG (at y=295, bottom at y=375). */
const PHASE3_THANKYOU_TOP =
  PHASE3_STACK_TOP + SVG_PHASE3_SIZE + PHASE3_SVG_TO_THANKYOU_GAP;

// ============================================================================
// Typography constants
// ============================================================================

const PROVOCATION_FONT_SIZE = 82;
const SUPPORT_FONT_SIZE = 30;
const THANK_YOU_FONT_SIZE = 112;
const TAGLINE_FONT_SIZE = 40;
const LINK_URL_FONT_SIZE = 28;
const LINK_BULLET_FONT_SIZE = 38;
const ARROW_LABEL_FONT_SIZE = 30;

// ============================================================================
// Action link tokens — bullet-prefixed plain links, stacked vertically
// ============================================================================

/** Horizontal gap between the ↗ bullet glyph and the URL. */
const LINK_BULLET_TO_URL_GAP = 14;
/** Vertical gap between the two stacked link rows. */
const LINK_ROW_GAP = 22;
/** Underline offset — keeps the rule visibly detached from the text baseline. */
const LINK_UNDERLINE_OFFSET = 5;
const LINK_UNDERLINE_THICKNESS = 1;

// ============================================================================
// Flanking hand-drawn arrows — annotate the link rows with italic labels.
// Geometry is authored in a 400×70 viewBox; paths use pathLength={1} so the
// strokeDashoffset trace-in is independent of physical length.
// ============================================================================

const LEFT_ARROW_SHAFT_START = 435;
const LEFT_ARROW_SHAFT_DURATION = 32;
const LEFT_ARROW_HEAD_START = 467;
const LEFT_ARROW_HEAD_DURATION = 8;
const LEFT_LABEL_DELAY = 442;

const RIGHT_ARROW_SHAFT_START = 455;
const RIGHT_ARROW_SHAFT_DURATION = 32;
const RIGHT_ARROW_HEAD_START = 487;
const RIGHT_ARROW_HEAD_DURATION = 8;
const RIGHT_LABEL_DELAY = 462;

const ARROW_STROKE_WIDTH = 2.25;

const LEFT_ARROW_SHAFT_PATH =
  "M 6 34 C 60 52, 130 48, 200 40 C 260 34, 320 30, 372 32";
const LEFT_ARROW_HEAD_UPPER = "M 372 32 L 356 24";
const LEFT_ARROW_HEAD_LOWER = "M 372 32 L 358 41";

const RIGHT_ARROW_SHAFT_PATH =
  "M 392 34 C 330 18, 260 22, 190 30 C 130 37, 70 38, 14 32";
const RIGHT_ARROW_HEAD_UPPER = "M 14 32 L 30 24";
const RIGHT_ARROW_HEAD_LOWER = "M 14 32 L 29 41";

const LEFT_ARROW_SVG_LEFT = 285;
const LEFT_ARROW_SVG_TOP = 732;
const RIGHT_ARROW_SVG_LEFT = 1243;
const RIGHT_ARROW_SVG_TOP = 820;

const LEFT_LABEL_LEFT = 140;
const LEFT_LABEL_TOP = 743;
const RIGHT_LABEL_LEFT = 1645;
const RIGHT_LABEL_TOP = 836;

// ============================================================================
// Action link content
// ============================================================================

type ActionLinkData = {
  url: string;
  delay: number;
};

const ACTION_LINKS: readonly ActionLinkData[] = [
  { url: "agentic-automl.vercel.app", delay: LINK_1_DELAY },
  { url: "agentic-automl.vercel.app/repo", delay: LINK_2_DELAY },
];

// ============================================================================
// Component
// ============================================================================

export const ClosingSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  return (
    <SlideShell theme={theme} gradient divider={false} footer>
      {/* Absolute-fill wrapper escapes SlideShell's `paddingLeft: 120` inset so
       *  the centered composition ignores the left content column. */}
      <AbsoluteFill
        style={{
          paddingLeft: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <ClosingMarkLayer theme={theme} />
        <ProvocationLayer theme={theme} />
        <SupportCopyLayer theme={theme} />
        <GratitudeLayer theme={theme} />
        <FlankingArrowsLayer theme={theme} />
        <WordmarkRevealLayer theme={theme} />
      </AbsoluteFill>
    </SlideShell>
  );
};

// ============================================================================
// Layer: the migrating product mark
// ============================================================================

const ClosingMarkLayer: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entry — fade + gentle scale 0.92 → 1 (SPRING_SETTLE, NOT HERO)
  const entryProgress = spring({
    fps,
    frame: frame - SVG_ENTER_DELAY,
    config: SPRING_SETTLE,
    durationInFrames: 30,
  });
  const entryOpacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const entryScale = interpolate(entryProgress, [0, 1], [0.92, 1]);

  // Morph — size 320 → 160 and translateY 0 → SVG_TRANSLATE_Y across
  // f=SVG_MORPH_START..SVG_MORPH_END. Mark holds at 160 throughout Phase 3/4.
  // Phase 5's mark shrink + slide are NOT handled here — WordmarkCenteredLayer
  // takes over at PHASE5_START with its own auto-centered mark instance.
  const size = interpolate(
    frame,
    [SVG_MORPH_START, SVG_MORPH_END],
    [SVG_PHASE1_SIZE, SVG_PHASE3_SIZE],
    { easing: EASE_IN_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const translateY = interpolate(
    frame,
    [SVG_MORPH_START, SVG_MORPH_END],
    [0, SVG_TRANSLATE_Y],
    { easing: EASE_IN_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // "Click into place" settle bump after the morph lands — 1.00 → 1.04 → 1.00.
  const settleBumpProgress = interpolate(
    frame,
    [SVG_SETTLE_BUMP_START, SVG_SETTLE_BUMP_MID, SVG_SETTLE_BUMP_END],
    [0, 1, 0],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const settleScale = 1 + settleBumpProgress * SVG_SETTLE_BUMP_PEAK;

  // Phase-4 breath — starts at exactly 0 at PHASE4_START (no snap on entry).
  // Suppressed during Phase 5 so the wordmark reads as rock-stable, not
  // breathing alongside the typographic reveal.
  const breathScale =
    frame >= PHASE4_START && frame < PHASE5_START
      ? 1 +
        Math.sin((frame - PHASE4_START) / SVG_BREATH_PERIOD_FRAMES) *
          SVG_BREATH_AMPLITUDE
      : 1;

  const composedScale = entryScale * settleScale * breathScale;

  // Hide this mark at PHASE5_START — WordmarkCenteredLayer takes over with an
  // auto-centered mark instance that coincides with this one's final state
  // (size 160, canvas center, y=310), so the swap is visually seamless.
  const phase5Hide = frame >= PHASE5_START ? 0 : 1;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: CANVAS_CENTER_Y,
        transform: `translate(-50%, -50%) translateY(${translateY}px) scale(${composedScale})`,
        opacity: entryOpacity * phase5Hide,
        width: size,
        height: size,
      }}
    >
      <ClosingMark size={size} theme={theme} />
    </div>
  );
};

/**
 * SVG placeholder — a one-line swap for the user's custom art.
 *
 * === USER SVG BODY — REPLACE WITH CUSTOM ART ===
 * Until the user's SVG ships, render a static `simple` variant of the product
 * mark so the slide is visually complete. Replace the `<AnimatedLogoMark />`
 * body below with the custom `<svg>...</svg>` paths. The parent wrapper owns
 * size + position + opacity + scale; internal art should be driven by
 * `useCurrentFrame()` inside its own SVG if it needs self-animation.
 *
 * Note: the `simple` variant's 2.5px stroke reads heavy at 160px. If the
 * placeholder ships to the final render, scale the stroke down or swap to
 * the `3d` variant for a denser silhouette.
 */
const ClosingMark: React.FC<{ size: number; theme: Theme }> = ({
  size,
  theme,
}) => {
  return (
    <AnimatedLogoMark
      size={size}
      theme={theme}
      mode="static"
      variant="simple"
    />
  );
};

// ============================================================================
// Layer: Phase 1 provocation headline (stagger-in, reverse-stagger-out)
// ============================================================================

const ProvocationLayer: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const entries = useStaggeredFadeIn(PROVOCATION_WORD_COUNT, {
    step: PROVOCATION_STAGGER_STEP,
    startDelay: PROVOCATION_STAGGER_START,
    translateY: 8,
    damping: SPRING_SETTLE.damping,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: PHASE1_HEADLINE_TOP,
        left: 0,
        right: 0,
        textAlign: "center",
      }}
    >
      <div
        style={{
          ...SERIF_FONT,
          fontSize: PROVOCATION_FONT_SIZE,
          letterSpacing: "-0.015em",
          lineHeight: 1.15,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          whiteSpace: "nowrap",
        }}
      >
        {PROVOCATION_WORDS.map((word, i) => {
          // Reverse stagger: last word exits first.
          const exitStart =
            PROVOCATION_EXIT_BASE_FRAME +
            (PROVOCATION_WORD_COUNT - 1 - i) * PROVOCATION_EXIT_STEP;
          const exitProgress = interpolate(
            frame,
            [exitStart, exitStart + PROVOCATION_EXIT_DURATION],
            [0, 1],
            { easing: EASE_IN, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const entry = entries[i]!;
          const opacity = entry.opacity * (1 - exitProgress);
          const translateY =
            entry.translateY + exitProgress * PROVOCATION_EXIT_TRANSLATE;
          return (
            <React.Fragment key={word}>
              <span
                style={{
                  display: "inline-block",
                  opacity,
                  transform: `translateY(${translateY}px)`,
                }}
              >
                {word}
              </span>
              {i < PROVOCATION_WORD_COUNT - 1 ? "\u00A0" : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// Layer: Phase 1 support copy (fades in, then fades out at Phase 2 open)
// ============================================================================

const SupportCopyLayer: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const entry = useFadeIn({
    translateY: 8,
    damping: SPRING_SETTLE.damping,
    delay: SUPPORT_FADE_IN_DELAY,
  });

  const exitProgress = interpolate(
    frame,
    [SUPPORT_FADE_OUT_START, SUPPORT_FADE_OUT_START + SUPPORT_FADE_OUT_DURATION],
    [0, 1],
    { easing: EASE_IN, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const opacity = entry.opacity * (1 - exitProgress);

  return (
    <div
      style={{
        position: "absolute",
        top: PHASE1_SUPPORT_TOP,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity,
        transform: entry.transform,
      }}
    >
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: SUPPORT_FONT_SIZE,
          lineHeight: 1.3,
          color: c.WORD_COLOR_ON_BG_GREYED,
          maxWidth: 1400,
          margin: "0 auto",
          letterSpacing: "-0.005em",
        }}
      >
        The agent processes, trains, evaluates, and deploys for you.
      </div>
    </div>
  );
};

// ============================================================================
// Layer: Phase 3 gratitude stack — "Thank you." + flourish + tagline + links
// ============================================================================

const GratitudeLayer: React.FC<{ theme: Theme }> = ({ theme }) => {
  const c = COLORS[theme];

  const taglineFade = useFadeIn({
    delay: TAGLINE_DELAY,
    translateY: 8,
    damping: SPRING_SETTLE.damping,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: PHASE3_THANKYOU_TOP,
        left: "50%",
        transform: "translateX(-50%)",
        width: PHASE3_CONTENT_WIDTH,
        textAlign: "center",
      }}
    >
      {/* "Thank you." — the emotional peak. SPRING_HERO is reserved for this
       *  per-char rise and used exactly once in the entire slide. A curly
       *  hand-drawn flourish anchors below the phrase, scaled up from
       *  HookSlide's default to match the hero-weight type. */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <ThankYouHeadline theme={theme} />
        <FlourishUnderline
          delay={THANK_YOU_FLOURISH_DELAY}
          drawOut={false}
          strokeWidth={THANK_YOU_FLOURISH_STROKE_WIDTH}
          style={{
            position: "absolute",
            top: "calc(100% - 2px)",
            left: 0,
            width: "100%",
            height: THANK_YOU_FLOURISH_HEIGHT,
          }}
        />
      </div>

      {/* Tagline — `text-wrap: balance` for a tidy 2-line break. Larger top
       *  margin clears the flourish underline under "Thank you." */}
      <div
        style={{
          ...SERIF_FONT,
          marginTop: 76,
          fontSize: TAGLINE_FONT_SIZE,
          lineHeight: 1.3,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: taglineFade.opacity,
          transform: taglineFade.transform,
          textWrap: "balance",
          letterSpacing: "-0.005em",
        }}
      >
        LLM-orchestrated pipelines from raw data to production models.
      </div>

      {/* Action links — bullet-prefixed rows stacked vertically. The
       *  `inline-flex` container shrink-wraps so the parent's `textAlign:
       *  center` centers the whole block while rows share a common left edge
       *  (bullets align vertically). */}
      <div
        style={{
          marginTop: 64,
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: LINK_ROW_GAP,
        }}
      >
        {ACTION_LINKS.map((link) => (
          <ActionLink key={link.url} data={link} theme={theme} />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// "Thank you." letter-by-letter rise (SPRING_HERO — the signature moment)
// ============================================================================

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
        const translateY = interpolate(progress, [0, 1], [THANK_YOU_TRANSLATE, 0]);
        // Non-breaking space so the glyph participates in the stagger rather
        // than collapsing via the browser's text-node whitespace handling.
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
// Action link — one row: ↗ bullet glyph · underlined monospace URL.
// No border, no background, no shadow — typography is the entire treatment.
// ============================================================================

const ActionLink: React.FC<{ data: ActionLinkData; theme: Theme }> = ({
  data,
  theme,
}) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const linkFade = useFadeIn({
    delay: data.delay,
    translateY: 8,
  });

  // Bullet micro-pulse begins at PHASE4_START so the first cycle starts at 0 —
  // prevents a snap when Phase 4 opens.
  const arrowPulseX =
    frame >= PHASE4_START
      ? Math.sin((frame - PHASE4_START) / ARROW_PULSE_PERIOD_FRAMES) *
        ARROW_PULSE_AMPLITUDE
      : 0;

  // USER-REQUESTED OVERRIDE of themes.ts:107-108 institutional-only rule.
  // Miami red bullet glyph is intentional for the expo-framing closing slide;
  // the rule remains in force for all OTHER slides.
  const bulletColor = INSTITUTIONAL.MIAMI_RED;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "baseline",
        gap: LINK_BULLET_TO_URL_GAP,
        width: "max-content",
        opacity: linkFade.opacity,
        transform: linkFade.transform,
      }}
    >
      {/* ↗ bullet glyph — Miami-red anchor; subtly pulses translateX in Phase 4. */}
      <span
        style={{
          ...MONOSPACE_FONT,
          fontSize: LINK_BULLET_FONT_SIZE,
          lineHeight: 1,
          color: bulletColor,
          transform: `translateX(${arrowPulseX}px)`,
          display: "inline-block",
        }}
      >
        ↗
      </span>

      {/* URL — the plain link itself. Monospace tabular-nums for even kerning;
       *  clean single-pixel underline detached from the baseline. */}
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
        {data.url}
      </span>
    </div>
  );
};

// ============================================================================
// HandDrawnArrow — a curved shaft + two-leg arrowhead, both trace-animated
// via strokeDashoffset (same pattern as MotionLine / AnimatedLogoMark). The
// italic label is absolutely positioned by the caller in canvas coordinates.
// ============================================================================

type HandDrawnArrowProps = {
  shaftPath: string;
  headUpperPath: string;
  headLowerPath: string;
  svgLeft: number;
  svgTop: number;
  labelText: string;
  labelLeft: number;
  labelTop: number;
  shaftStart: number;
  shaftDuration: number;
  headStart: number;
  headDuration: number;
  labelDelay: number;
  theme: Theme;
};

const HandDrawnArrow: React.FC<HandDrawnArrowProps> = ({
  shaftPath,
  headUpperPath,
  headLowerPath,
  svgLeft,
  svgTop,
  labelText,
  labelLeft,
  labelTop,
  shaftStart,
  shaftDuration,
  headStart,
  headDuration,
  labelDelay,
  theme,
}) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const shaftOffset = interpolate(
    frame,
    [shaftStart, shaftStart + shaftDuration],
    [1, 0],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const headOffset = interpolate(
    frame,
    [headStart, headStart + headDuration],
    [1, 0],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const labelFade = useFadeIn({
    delay: labelDelay,
    translateY: 6,
    damping: SPRING_SETTLE.damping,
  });

  const strokeColor = c.WORD_COLOR_ON_BG_APPEARED;

  return (
    <>
      <svg
        width="400"
        height="70"
        viewBox="0 0 400 70"
        style={{
          position: "absolute",
          left: svgLeft,
          top: svgTop,
          overflow: "visible",
        }}
      >
        <path
          d={shaftPath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={ARROW_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={shaftOffset}
        />
        <path
          d={headUpperPath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={ARROW_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={headOffset}
        />
        <path
          d={headLowerPath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={ARROW_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={headOffset}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: labelLeft,
          top: labelTop,
          ...REGULAR_FONT,
          fontWeight: 500,
          fontSize: ARROW_LABEL_FONT_SIZE,
          letterSpacing: "0",
          lineHeight: 1,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: labelFade.opacity,
          transform: labelFade.transform,
          whiteSpace: "nowrap",
        }}
      >
        {labelText}
      </div>
    </>
  );
};

// ============================================================================
// FlankingArrowsLayer — the two hand-drawn annotations on either side of the
// link stack. Sibling of GratitudeLayer (NOT a child) so coordinates are in
// raw canvas space, unaffected by GratitudeLayer's translateX(-50%) shift.
// ============================================================================

const FlankingArrowsLayer: React.FC<{ theme: Theme }> = ({ theme }) => {
  return (
    <>
      <HandDrawnArrow
        theme={theme}
        shaftPath={LEFT_ARROW_SHAFT_PATH}
        headUpperPath={LEFT_ARROW_HEAD_UPPER}
        headLowerPath={LEFT_ARROW_HEAD_LOWER}
        svgLeft={LEFT_ARROW_SVG_LEFT}
        svgTop={LEFT_ARROW_SVG_TOP}
        labelText="Live Demo"
        labelLeft={LEFT_LABEL_LEFT}
        labelTop={LEFT_LABEL_TOP}
        shaftStart={LEFT_ARROW_SHAFT_START}
        shaftDuration={LEFT_ARROW_SHAFT_DURATION}
        headStart={LEFT_ARROW_HEAD_START}
        headDuration={LEFT_ARROW_HEAD_DURATION}
        labelDelay={LEFT_LABEL_DELAY}
      />
      <HandDrawnArrow
        theme={theme}
        shaftPath={RIGHT_ARROW_SHAFT_PATH}
        headUpperPath={RIGHT_ARROW_HEAD_UPPER}
        headLowerPath={RIGHT_ARROW_HEAD_LOWER}
        svgLeft={RIGHT_ARROW_SVG_LEFT}
        svgTop={RIGHT_ARROW_SVG_TOP}
        labelText="Gitlab Repository"
        labelLeft={RIGHT_LABEL_LEFT}
        labelTop={RIGHT_LABEL_TOP}
        shaftStart={RIGHT_ARROW_SHAFT_START}
        shaftDuration={RIGHT_ARROW_SHAFT_DURATION}
        headStart={RIGHT_ARROW_HEAD_START}
        headDuration={RIGHT_ARROW_HEAD_DURATION}
        labelDelay={RIGHT_LABEL_DELAY}
      />
    </>
  );
};

// ============================================================================
// WordmarkRevealLayer — auto-centered (A mark) + "gentic AutoML Platform".
//
// Horizontal centering is structural, not tuned: the outer block spans the
// full canvas width with `textAlign: center`, and the two inline-block
// children (mark + text) auto-center as a composed unit. Each character is
// CONDITIONALLY rendered once its reveal frame arrives, so the wrapper's
// intrinsic width grows as chars appear — which re-centers the group every
// frame and naturally shifts the mark left to accommodate the growing text.
// No hardcoded X coordinate is needed or possible to miscalculate.
//
// At Phase 5 start, this layer contains only the mark (no chars yet), so the
// mark auto-centers on canvas — visually identical to ClosingMarkLayer's
// final state (size 160, canvas center, y=310). The handoff is seamless.
// ============================================================================

const WORDMARK_CHARS = WORDMARK_TEXT.split("");

/** Viewbox y at which the mark's visual "A" baseline sits (bottom of legs). */
const MARK_VISUAL_BASELINE_VIEWBOX_Y = 26.5;
/** AnimatedLogoMark's total viewBox height. */
const MARK_VIEWBOX_SIZE = 32;
/** Fraction of mark size from the SVG bottom to the visual A baseline — used
 *  to nudge the SVG down via `verticalAlign` so its visual legs (not the SVG's
 *  bottom edge) land on the text baseline. */
const MARK_BASELINE_BOTTOM_OFFSET_RATIO =
  (MARK_VIEWBOX_SIZE - MARK_VISUAL_BASELINE_VIEWBOX_Y) / MARK_VIEWBOX_SIZE;

const WordmarkRevealLayer: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = COLORS[theme];

  // Don't render at all before Phase 5 — ClosingMarkLayer owns the mark until
  // this layer takes over.
  if (frame < PHASE5_START) return null;

  // Mark size shrinks SVG_PHASE3_SIZE → WORDMARK_MARK_FINAL_SIZE during the
  // slide. At PHASE5_START this equals SVG_PHASE3_SIZE (160) — matching the
  // size ClosingMarkLayer held at, so the handoff is invisible.
  const markSize = interpolate(
    frame,
    [PHASE5_START, PHASE5_SLIDE_END],
    [SVG_PHASE3_SIZE, WORDMARK_MARK_FINAL_SIZE],
    { easing: EASE_IN_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Shift mark DOWN by (size - visualBaseline) so its visual A baseline —
  // not the SVG bottom — lands on the text baseline. `verticalAlign` with a
  // negative value moves an inline-block below the baseline.
  const markVerticalAlign = -MARK_BASELINE_BOTTOM_OFFSET_RATIO * markSize;

  return (
    <div
      style={{
        position: "absolute",
        top: WORDMARK_WRAPPER_TOP,
        left: 0,
        right: 0,
        textAlign: "center",
        whiteSpace: "nowrap",
        // Eliminate the ~4px whitespace between the mark and text spans so
        // `WORDMARK_MARK_TO_TEXT_GAP` controls the exact spacing.
        fontSize: 0,
      }}
    >
      {/* A mark — first inline-block child, vertically baseline-nudged. */}
      <span
        style={{
          display: "inline-block",
          width: markSize,
          height: markSize,
          verticalAlign: `${markVerticalAlign}px`,
        }}
      >
        <AnimatedLogoMark
          size={markSize}
          theme={theme}
          mode="static"
          variant="simple"
        />
      </span>

      {/* Text — second inline-block child; its intrinsic width grows as the
       *  char loop conditionally yields more <span>s, which drives the
       *  wrapper's auto-centering re-layout (= mark slides left naturally). */}
      <span
        style={{
          display: "inline-block",
          verticalAlign: "baseline",
          marginLeft: WORDMARK_MARK_TO_TEXT_GAP,
          ...TITLE_FONT,
          // TITLE_FONT spreads Plus Jakarta Sans weight 700 (bold). Override
          // to weight 400 — the thin 2.5-px stroked A mark reads lighter than
          // bold type, so matching the optical weight unifies the wordmark.
          fontWeight: 400,
          fontSize: WORDMARK_TEXT_FONT_SIZE,
          letterSpacing: WORDMARK_TEXT_LETTER_SPACING,
          wordSpacing: WORDMARK_TEXT_WORD_SPACING,
          lineHeight: WORDMARK_TEXT_LINE_HEIGHT,
          color: c.WORD_COLOR_ON_BG_APPEARED,
        }}
      >
        {WORDMARK_CHARS.map((ch, i) => {
          const charStart =
            PHASE5_TEXT_REVEAL_START + i * PHASE5_TEXT_CHAR_STEP;
          // Conditional render: char doesn't exist in the DOM (and takes no
          // width) until its reveal frame. This is what drives the re-center.
          if (frame < charStart) return null;
          const progress = spring({
            fps,
            frame: frame - charStart,
            config: SPRING_SETTLE,
            durationInFrames: PHASE5_TEXT_CHAR_DURATION,
          });
          const opacity = interpolate(progress, [0, 1], [0, 1]);
          const translateY = interpolate(progress, [0, 1], [8, 0]);
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
      </span>
    </div>
  );
};
