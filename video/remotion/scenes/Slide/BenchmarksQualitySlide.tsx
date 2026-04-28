import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ARCH_PALETTE } from "../../../config/arch-layout";
import {
  METHOD_FOOTNOTES,
  QUALITY_BASELINE_RANK,
  QUALITY_DATA,
  QUALITY_HERO_RANK,
} from "../../../config/benchmarks-content";
import { METHOD_STRIP, SEQ_COUNTER } from "../../../config/benchmarks-layout";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { blendColor } from "../../helpers/colorBlend";
import { useFadeIn } from "../../helpers/useFadeIn";
import { CountUpNumber } from "../../primitives/CountUpNumber";
import { MotionLine } from "../../primitives/MotionLine";
import { PercentileGauge } from "../../primitives/PercentileGauge";
import { SlideShell } from "../../primitives/SlideShell";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 10-phase timeline (sum = 1080 = 18 s @ 60 fps).
 *   0: AbsoluteFill fade-in                            30f
 *   1: title fade-in                                   60f
 *   2: gauge track draws in                            90f
 *   3: gauge marker slides to rank 92                  60f
 *   4: gauge callout (ScaleInNumber) lands             30f
 *   5: section-label "PER-DATASET BREAKDOWN" fade      30f
 *   6: section-label hairline draws                    90f
 *   7: 5 QualityCells stagger in (15f stride → 60f)   300f
 *   8: methodology strip fade                          30f
 *   9: hold (halo breathes, reading time)             360f */
const PHASES = [30, 60, 90, 60, 30, 30, 90, 300, 30, 360] as const;

type TenPhases = [
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
];

const TITLE = "Where the outputs land on the Kaggle leaderboards.";

// --- Layout tokens (slide-local; not shared with other benchmarks slides) ----
const TITLE_POS = { left: 120, top: 232, width: 1600 } as const;
const GAUGE_POS = { x: 120, y: 400, w: 1680, trackH: 28 } as const;
const SECTION_LABEL_POS = { left: 120, top: 520, fontSize: 12 } as const;
const SECTION_HAIRLINE_W = 48;
const STRIP_POS = { left: 120, top: 580, width: 1680 } as const;
const COLUMN_WIDTH = Math.floor(STRIP_POS.width / QUALITY_DATA.length); // 336
const CELL_COUNTUP_FRAMES = 36;
const CELL_STAGGER = 15;
const GREEN_HEX = "#16A34A";
const GREEN_UNDERLINE_W = 180;
const GREEN_UNDERLINE_FRAMES = 30;
const HIGHLIGHT_CROSSFADE_FRAMES = 30;
const STRIP_HAIRLINE_DURATION = 36;

export const BenchmarksQualitySlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const phases = useTimeline([...PHASES]) as TenPhases;
  const pFade = phases[0];
  const pTitle = phases[1];
  const pGaugeTrack = phases[2];
  const pGaugeMarker = phases[3];
  // phases[4] (gauge callout) is driven internally by PercentileGauge's
  // heroCallout + ScaleInNumber; we only need its start frame as an offset.
  const pSectionLabel = phases[5];
  const pHairline = phases[6];
  const pCards = phases[7];
  const pMethod = phases[8];
  // phases[9] (hold) is narrative pacing; consumed by the gauge's breathing halo.
  const c = COLORS[theme];

  const fade = useFadeIn({ delay: pFade.start, durationInFrames: 30 });
  const title = useFadeIn({
    delay: pTitle.start,
    translateY: 12,
    damping: 200,
  });
  const sectionLabel = useFadeIn({
    delay: pSectionLabel.start,
    translateY: 4,
    damping: 200,
  });
  const methodFade = useFadeIn({
    delay: pMethod.start,
    translateY: 4,
    damping: 200,
  });

  return (
    <SlideShell theme={theme} eyebrow="QUALITY" divider footer>
      <div style={{ position: "absolute", inset: 0, opacity: fade.opacity }}>
        {/* Title — static fade (no dim-after-settle, the gauge is the hero). */}
        <div
          style={{
            position: "absolute",
            left: TITLE_POS.left,
            top: TITLE_POS.top,
            width: TITLE_POS.width,
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
          {TITLE}
        </div>

        {/* Full-width PercentileGauge — SPRING_HERO via heroCallout. The green
         *  breathing halo on the marker dot continues through the hold phase. */}
        <PercentileGauge
          theme={theme}
          x={GAUGE_POS.x}
          y={GAUGE_POS.y}
          w={GAUGE_POS.w}
          trackH={GAUGE_POS.trackH}
          rank={QUALITY_HERO_RANK}
          topTierThreshold={90}
          baselineRank={QUALITY_BASELINE_RANK}
          axisTicks={[50, 75, 90]}
          trackDrawStartFrame={pGaugeTrack.start}
          trackDrawDurationFrames={90}
          markerStartFrame={pGaugeMarker.start}
          markerDurationFrames={60}
          calloutStartFrame={pGaugeMarker.start + 20}
          heroCallout
        />

        {/* Section label — monospace eyebrow + 48px hairline. Bridges the gauge
         *  (overview) to the per-dataset strip (detail). */}
        <div
          style={{
            position: "absolute",
            left: SECTION_LABEL_POS.left,
            top: SECTION_LABEL_POS.top,
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: sectionLabel.opacity,
            transform: sectionLabel.transform,
          }}
        >
          <span
            style={{
              ...MONOSPACE_FONT,
              fontSize: SECTION_LABEL_POS.fontSize,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: c.WORD_COLOR_ON_BG_GREYED,
            }}
          >
            Per-dataset breakdown
          </span>
          <MotionLine
            x1={0}
            y1={0}
            x2={SECTION_HAIRLINE_W}
            y2={0}
            delay={pHairline.start}
            durationInFrames={30}
            color={c.BORDER_COLOR}
            strokeWidth={1}
            svgWidth={SECTION_HAIRLINE_W}
            svgHeight={2}
          />
        </div>

        {/* Telemetry-strip layout: 5 cells, no card chrome. Top hairline draws
         *  in with the first cell; each cell stagger is 15f. */}
        <div
          style={{
            position: "absolute",
            left: STRIP_POS.left,
            top: STRIP_POS.top,
            width: STRIP_POS.width,
          }}
        >
          <MotionLine
            x1={0}
            y1={0}
            x2={STRIP_POS.width}
            y2={0}
            delay={pCards.start - 20}
            durationInFrames={STRIP_HAIRLINE_DURATION}
            color={c.BORDER_COLOR}
            strokeWidth={1}
            svgWidth={STRIP_POS.width}
            svgHeight={2}
            style={{ position: "absolute", top: -16, left: 0 }}
          />
          <div style={{ display: "flex", flexDirection: "row" }}>
            {QUALITY_DATA.map((d, i) => (
              <QualityCell
                key={d.id}
                theme={theme}
                datum={d}
                columnWidth={COLUMN_WIDTH}
                delay={pCards.start + i * CELL_STAGGER}
              />
            ))}
          </div>
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
          03 / 04
        </div>

        {/* Methodology strip — shared bottom layout across the 4 benchmarks slides. */}
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
          {METHOD_FOOTNOTES.quality}
        </div>
      </div>
    </SlideShell>
  );
};

// ---------------------------------------------------------------------------
// QualityCell — one column in the per-dataset telemetry strip. No card chrome.
// Titanic (highlight: true) crossfades its number + caption to success-green as
// the CountUp settles, with a 2px green hairline drawing underneath.
// ---------------------------------------------------------------------------
type QualityDatum = (typeof QUALITY_DATA)[number];

const QualityCell: React.FC<{
  theme: Theme;
  datum: QualityDatum;
  columnWidth: number;
  delay: number;
}> = ({ theme, datum, columnWidth, delay }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];
  const settleFrame = delay + CELL_COUNTUP_FRAMES;

  // Gate the whole cell on the frame before its count-up begins. Without this,
  // `CountUpNumber` renders `format(from)` from frame 0, leaking zeros into
  // the layout behind the gauge entrance.
  const cellFade = useFadeIn({
    delay: delay - 4,
    translateY: 4,
    damping: 200,
  });

  // Titanic highlight: number + caption color ease ink → #16A34A across 30f
  // starting at the settle frame.
  const highlightProgress = datum.highlight
    ? interpolate(
        frame,
        [settleFrame, settleFrame + HIGHLIGHT_CROSSFADE_FRAMES],
        [0, 1],
        { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 0;
  const numberColor = datum.highlight
    ? blendColor(c.WORD_COLOR_ON_BG_APPEARED, GREEN_HEX, highlightProgress)
    : c.WORD_COLOR_ON_BG_APPEARED;
  const captionColor = datum.highlight
    ? blendColor(c.WORD_COLOR_ON_BG_GREYED, GREEN_HEX, highlightProgress)
    : c.WORD_COLOR_ON_BG_GREYED;

  // Caption fades in 10f before the number settles (per TelemetryStrip pattern).
  const captionFade = useFadeIn({
    delay: settleFrame - 10,
    translateY: 4,
    damping: 200,
  });

  const formatValue = (v: number) => v.toFixed(datum.decimals);

  return (
    <div
      style={{
        width: columnWidth,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        paddingRight: 16,
        position: "relative",
        opacity: cellFade.opacity,
        transform: cellFade.transform,
      }}
    >
      {/* Eyebrow — dataset name */}
      <div
        style={{
          ...MONOSPACE_FONT,
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: c.WORD_COLOR_ON_BG_GREYED,
          marginBottom: 16,
        }}
      >
        {datum.eyebrow}
      </div>

      {/* Hero value — big number. Relative-positioned so the green underline
       *  anchors to the number's baseline box, not a hard-coded pixel offset. */}
      <div
        style={{
          ...TITLE_FONT,
          fontSize: 52,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: numberColor,
          fontVariantNumeric: "tabular-nums",
          position: "relative",
        }}
      >
        <CountUpNumber
          from={datum.from}
          to={datum.value}
          format={formatValue}
          delay={delay}
          durationInFrames={CELL_COUNTUP_FRAMES}
        />
        {datum.highlight ? (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 6,
            }}
          >
            <MotionLine
              x1={0}
              y1={0}
              x2={GREEN_UNDERLINE_W}
              y2={0}
              delay={settleFrame + 2}
              durationInFrames={GREEN_UNDERLINE_FRAMES}
              color={GREEN_HEX}
              strokeWidth={2}
              svgWidth={GREEN_UNDERLINE_W}
              svgHeight={2}
            />
          </div>
        ) : null}
      </div>

      {/* Caption — percentile position */}
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 14,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: captionColor,
          marginTop: 12,
          opacity: captionFade.opacity,
          transform: captionFade.transform,
        }}
      >
        {datum.percentile} on Kaggle
      </div>
    </div>
  );
};
