import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ARCH_PALETTE } from "../../../config/arch-layout";
import {
  HOOK_PILLARS,
  METHOD_FOOTNOTES,
} from "../../../config/benchmarks-content";
import { METHOD_STRIP, SEQ_COUNTER } from "../../../config/benchmarks-layout";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { BreathingHaloRing } from "../../primitives/NodeHaloRing";
import { CountUpNumber } from "../../primitives/CountUpNumber";
import { FlourishUnderline } from "../../primitives/FlourishUnderline";
import { MotionLine } from "../../primitives/MotionLine";
import { ScaleInNumber } from "../../primitives/ScaleInNumber";
import { SlideShell } from "../../primitives/SlideShell";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

// -----------------------------------------------------------------------------
// Frame budget (60fps). Sum = 900 = 15s.
// -----------------------------------------------------------------------------
//   0:  0–30     AbsoluteFill fade
//   1: 30–90     title fade-in (the inline flourish span precludes TypeOnText)
//   2: 90–120    miami-red flourish draws under "measurements."
//   3: 120–180   three panels enter (stagger 15f)
//   4: 180–270   internal hairlines draw
//   5: 270–360   hero numerals land (CountUp x2 + ScaleIn hero)
//   6: 360–420   uppercase captions fade
//   7: 420–900   hold (methodology strip fades in; hero pillar breathes)
const PHASES = [30, 60, 30, 60, 90, 90, 60, 480] as const;

type EightPhases = [
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
];
type ThreePanels = [StaggeredItem, StaggeredItem, StaggeredItem];

// -----------------------------------------------------------------------------
// Panel geometry — mirrors ProblemTrioSlide's PanelShell contract. Row width:
// 3 × 552 + 2 × 24 = 1704. Anchored at x=120, so it ends at 1824 — safely
// inside 1920. Height trimmed to 600 so the methodology strip at y≈970 keeps
// breathing room.
// -----------------------------------------------------------------------------
const PANEL_WIDTH = 552;
const PANEL_HEIGHT = 600;
const PANEL_GAP = 24;
const PANEL_PADDING = 40;
const PANEL_RADIUS = 8;
const PANEL_SHADOW = "0 2px 12px rgba(0, 0, 0, 0.04)";
const PANEL_BORDER = "rgba(0, 0, 0, 0.10)";
const PANEL_ROW_LEFT = 120;
const PANEL_ROW_TOP = 300;

const PANEL_TEXT_HEIGHT = 240;
const PANEL_SEPARATOR_Y = PANEL_TEXT_HEIGHT;
const PANEL_VISUAL_HEIGHT = PANEL_HEIGHT - PANEL_TEXT_HEIGHT - 1;

const PANEL_STAGGER = 15;
const PANEL_TRANSLATE_Y = 24;
const PANEL_SCALE_FROM = 0.985;

// -----------------------------------------------------------------------------
// Copy constants — pulled inline so the title flourish pattern (and the
// pillar-level eyebrow/caption split) stays visible at call site.
// -----------------------------------------------------------------------------
const TITLE_PREFIX = "Three ";
const TITLE_KEYWORD = "measurements.";
const TITLE_SUFFIX = " One night of runs.";

const PILLAR_CAPTIONS: readonly [string, string, string] = [
  "× faster than Jupyter",
  "flaws caught",
  "Kaggle percentile, Titanic",
];

// -----------------------------------------------------------------------------
// Style tokens — kept local so the slide remains self-describing.
// -----------------------------------------------------------------------------
const PANEL_HEADLINE_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 28,
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
  minHeight: 68,
};

const PANEL_BODY_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontSize: 18,
  lineHeight: 1.5,
  marginTop: 18,
  minHeight: "4.5em",
};

const EYEBROW_STYLE: React.CSSProperties = {
  ...MONOSPACE_FONT,
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const HERO_NUMBER_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontWeight: 600,
  fontSize: 112,
  letterSpacing: "-0.02em",
  lineHeight: 0.95,
  fontVariantNumeric: "tabular-nums",
};

const CAPTION_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  marginTop: 16,
  textAlign: "center",
};

// -----------------------------------------------------------------------------
// BenchmarksHookSlide — teaser for the benchmark arc. Three equal-weight
// panels, no dimming (unlike ProblemTrio), with the guardrails hero holding
// the only ScaleInNumber on the slide.
// -----------------------------------------------------------------------------
export const BenchmarksHookSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const [
    pFade,
    pTitle,
    pFlourish,
    pPanels,
    pHairline,
    pNumbers,
    pCaptions,
    pHold,
  ] = useTimeline([...PHASES]) as EightPhases;
  const c = COLORS[theme];

  const fade = useFadeIn({ delay: pFade.start, durationInFrames: 30 });
  const title = useFadeIn({
    delay: pTitle.start,
    translateY: 12,
    damping: 200,
  });
  const methodFade = useFadeIn({
    delay: pHold.start,
    translateY: 4,
    damping: 200,
  });

  const panels = useStaggeredFadeIn(HOOK_PILLARS.length, {
    step: PANEL_STAGGER,
    startDelay: pPanels.start,
    translateY: PANEL_TRANSLATE_Y,
    damping: 200,
  }) as ThreePanels;

  return (
    <SlideShell theme={theme} eyebrow="BENCHMARKS" divider footer>
      <div style={{ position: "absolute", inset: 0, opacity: fade.opacity }}>
        {/* Title — flourish wraps "measurements." the same way ArchHookSlide
         *  wraps "machinery" (ArchHookSlide.tsx:213-252). */}
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 232,
            width: 1600,
            ...TITLE_FONT,
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: title.opacity,
            transform: title.transform,
          }}
        >
          {TITLE_PREFIX}
          <span
            style={{
              position: "relative",
              display: "inline-block",
              lineHeight: 1.1,
            }}
          >
            {TITLE_KEYWORD}
            <FlourishUnderline
              delay={pFlourish.start}
              drawOut={false}
              color={ARCH_PALETTE.miamiRed}
              style={{
                position: "absolute",
                top: "calc(100% - 4px)",
                left: 0,
                width: "100%",
                height: 16,
              }}
            />
          </span>
          {TITLE_SUFFIX}
        </div>

        {/* Three benchmark panels — equal weight, no focus-dim. */}
        <div
          style={{
            position: "absolute",
            left: PANEL_ROW_LEFT,
            top: PANEL_ROW_TOP,
            display: "flex",
            gap: PANEL_GAP,
            alignItems: "flex-start",
          }}
        >
          {HOOK_PILLARS.map((pillar, i) => (
            <BenchmarkPanel
              key={pillar.eyebrow}
              theme={theme}
              pillar={pillar}
              caption={PILLAR_CAPTIONS[i] ?? ""}
              enter={panels[i] as StaggeredItem}
              hairlineDelay={pHairline.start + i * 10}
              numberDelay={pNumbers.start + i * 15}
              captionDelay={pCaptions.start + i * 15}
              haloDelay={pHold.start}
            />
          ))}
        </div>

        {/* Top-right sequence counter. */}
        <div
          style={{
            position: "absolute",
            right: SEQ_COUNTER.right,
            top: SEQ_COUNTER.top,
            ...MONOSPACE_FONT,
            fontSize: SEQ_COUNTER.fontSize,
            color: ARCH_PALETTE.mute,
          }}
        >
          01 / 04
        </div>

        {/* Methodology strip — fades in during the hold. */}
        <div
          style={{
            position: "absolute",
            left: METHOD_STRIP.left,
            bottom: METHOD_STRIP.bottom,
            ...MONOSPACE_FONT,
            fontSize: METHOD_STRIP.fontSize,
            letterSpacing: METHOD_STRIP.letterSpacing,
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: methodFade.opacity,
            transform: methodFade.transform,
          }}
        >
          {METHOD_FOOTNOTES.hook}
        </div>
      </div>
    </SlideShell>
  );
};

// -----------------------------------------------------------------------------
// BenchmarkPanel — single 552×600 card: eyebrow + headline + body paragraph
// on top, hairline separator, hero numeral centered in the bottom region.
// Hero pillar (guardrails) renders the slide's sole ScaleInNumber and gains a
// subtle breathing halo during the hold.
// -----------------------------------------------------------------------------
type HookPillar = (typeof HOOK_PILLARS)[number];

const BenchmarkPanel: React.FC<{
  theme: Theme;
  pillar: HookPillar;
  caption: string;
  enter: StaggeredItem;
  hairlineDelay: number;
  numberDelay: number;
  captionDelay: number;
  haloDelay: number;
}> = ({
  theme,
  pillar,
  caption,
  enter,
  hairlineDelay,
  numberDelay,
  captionDelay,
  haloDelay,
}) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];
  const scale = interpolate(enter.progress, [0, 1], [PANEL_SCALE_FROM, 1]);
  const captionOpacity = interpolate(
    frame,
    [captionDelay, captionDelay + 20],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Opacity gate on the hero numeral so the count-up's `format(0)` state
  // (e.g. "0×" reading as "zero times faster", or "TOP 100%" reading as
  // "worst percentile") never appears between panel entry and number firing.
  // Mirrors the TelemetryCell `delay - 4` pre-roll pattern (TechStackSlide:857).
  const heroOpacity = interpolate(
    frame,
    [numberDelay - 4, numberDelay + 4],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const isHero = pillar.hero;
  const heroColor = isHero ? c.ACCENT_COLOR : c.WORD_COLOR_ON_BG_APPEARED;

  return (
    <div
      style={{
        position: "relative",
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        borderRadius: PANEL_RADIUS,
        background: c.BACKGROUND_ELEVATED,
        border: `1px solid ${PANEL_BORDER}`,
        boxShadow: PANEL_SHADOW,
        opacity: enter.opacity,
        transform: `translateY(${enter.translateY}px) scale(${scale})`,
        overflow: "hidden",
      }}
    >
      {/* Text region — eyebrow, headline, body. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: PANEL_TEXT_HEIGHT,
          padding: PANEL_PADDING,
          boxSizing: "border-box",
        }}
      >
        <div style={{ ...EYEBROW_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
          {pillar.eyebrow}
        </div>
        <div
          style={{
            ...PANEL_HEADLINE_STYLE,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            marginTop: 10,
          }}
        >
          {pillar.headline}
        </div>
        <div style={{ ...PANEL_BODY_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
          {pillar.body}
        </div>
      </div>

      {/* Hairline separator. */}
      <div
        style={{
          position: "absolute",
          top: PANEL_SEPARATOR_Y,
          left: PANEL_PADDING,
          right: PANEL_PADDING,
          pointerEvents: "none",
        }}
      >
        <MotionLine
          x1={0}
          y1={0}
          x2={PANEL_WIDTH - PANEL_PADDING * 2}
          y2={0}
          delay={hairlineDelay}
          durationInFrames={30}
          color={c.BORDER_COLOR}
          svgWidth={PANEL_WIDTH - PANEL_PADDING * 2}
          svgHeight={2}
        />
      </div>

      {/* Hero-numeral region — centered number + uppercase caption below. */}
      <div
        style={{
          position: "absolute",
          top: PANEL_SEPARATOR_Y + 1,
          left: 0,
          right: 0,
          height: PANEL_VISUAL_HEIGHT,
          padding: PANEL_PADDING,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ ...HERO_NUMBER_STYLE, color: heroColor, opacity: heroOpacity }}>
          <HeroNumber pillar={pillar} delay={numberDelay} />
        </div>
        <div
          style={{
            ...CAPTION_STYLE,
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: captionOpacity,
          }}
        >
          {caption}
        </div>
      </div>

      {/* Hero panel gets a continuous breathing halo during the hold so the
       *  reader's eye lands on the 16/20 claim. Matches the arch-section
       *  shimmer idiom (NodeHaloRing's BreathingHaloRing). */}
      {isHero ? (
        <BreathingHaloRing
          x={0}
          y={0}
          w={PANEL_WIDTH}
          h={PANEL_HEIGHT}
          radius={PANEL_RADIUS}
          at={haloDelay}
          color={c.ACCENT_COLOR}
          minOpacity={0.08}
          maxOpacity={0.2}
          minScale={1.0}
          maxScale={1.005}
          strokeWidth={2}
        />
      ) : null}
    </div>
  );
};

// -----------------------------------------------------------------------------
// HeroNumber — dispatches between CountUp (speed, quality) and ScaleIn
// (guardrails hero). Kept tiny and inline so every hero-numeral behaviour
// lives in one place.
// -----------------------------------------------------------------------------
const HeroNumber: React.FC<{ pillar: HookPillar; delay: number }> = ({
  pillar,
  delay,
}) => {
  if (pillar.hero) {
    return <ScaleInNumber value={pillar.display} delay={delay} />;
  }
  if (pillar.eyebrow === "SPEED") {
    return (
      <CountUpNumber
        from={0}
        to={pillar.value}
        format={(v) => `${Math.round(v)}\u00D7`}
        delay={delay}
      />
    );
  }
  // QUALITY pillar — format is "TOP N%" where N = 100 − percentile.
  return (
    <CountUpNumber
      from={0}
      to={pillar.value}
      format={(v) => `TOP ${Math.max(0, 100 - Math.round(v))}%`}
      delay={delay}
    />
  );
};
