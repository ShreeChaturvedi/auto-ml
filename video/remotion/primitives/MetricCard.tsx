import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_OUT, SPRING_UI } from "../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../config/fonts";
import type { Theme } from "../../config/themes";
import { COLORS } from "../../config/themes";
import { BENCHMARKS_PALETTE } from "../../config/benchmarks-layout";
import { blendColor } from "../helpers/colorBlend";
import { CountUpNumber } from "./CountUpNumber";
import { ScaleInNumber } from "./ScaleInNumber";

export type MetricCardSize = "md" | "lg";
export type MetricCardBadgeKind = "good" | "neutral" | "bad";

export type MetricCardProps = {
  theme: Theme;
  x: number;
  y: number;
  /** `md` = 320×200, `lg` = 460×300. Explicit `w`/`h` override these. */
  size?: MetricCardSize;
  w?: number;
  h?: number;
  eyebrow: string;
  /** Numeric target the count-up lands on. */
  value: number;
  /** Starting value for the count-up. Default 0. Set to a baseline for error
   *  metrics so the count animates DOWN (improvement direction). */
  from?: number;
  /** Pre-formatter that produces the rendered hero string. */
  format?: (v: number) => string;
  /** When true, render the hero numeral via `ScaleInNumber` (SPRING_HERO).
   *  Caller MUST provide `format` so this primitive can compute the string
   *  passed to `ScaleInNumber.value`. Limit to ONE per slide. */
  hero?: boolean;
  subtitle?: string;
  badge?: string;
  badgeKind?: MetricCardBadgeKind;
  /** Body-slot content rendered below the subtitle. Used by the Hook pillar to
   *  embed a mini `PercentileGauge`. */
  children?: React.ReactNode;
  enterFrame?: number;
  enterDurationFrames?: number;
  numberOffsetFrames?: number;
  numberDurationFrames?: number;
  /** Border crossfades hairline → ACCENT_COLOR over 30f, starting right after
   *  the number settles. */
  highlight?: boolean;
};

export type MetricCardFrameState = {
  opacity: number;
  scale: number;
  translateY: number;
  borderColor: string;
  numberActive: boolean;
};

const DEFAULT_ENTER_DURATION = 24;
const DEFAULT_NUMBER_OFFSET = 18;
const DEFAULT_NUMBER_DURATION = 36;
const HIGHLIGHT_DURATION = 30;
const MD_W = 320;
const MD_H = 200;
const LG_W = 460;
const LG_H = 300;

/**
 * Pure keyframe calculator — testable without Remotion's render context.
 * Mirrors the 2-progress pattern in `computeGraphNode` so callers can feed in
 * spring progress for the card entrance and a linear 0→1 progress for the
 * highlight border crossfade independently.
 */
export const computeMetricCard = (
  frame: number,
  enterProgress: number,
  highlightProgress: number,
  props: MetricCardProps,
): MetricCardFrameState => {
  const c = COLORS[props.theme];
  const opacity = interpolate(enterProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(enterProgress, [0, 1], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(enterProgress, [0, 1], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const borderColor = props.highlight
    ? blendColor(c.BORDER_COLOR, c.ACCENT_COLOR, highlightProgress)
    : c.BORDER_COLOR;
  const enterAt = props.enterFrame ?? 0;
  const enterDur = props.enterDurationFrames ?? DEFAULT_ENTER_DURATION;
  const numberOffset = props.numberOffsetFrames ?? DEFAULT_NUMBER_OFFSET;
  const numberActive = frame >= enterAt + enterDur + numberOffset;
  return { opacity, scale, translateY, borderColor, numberActive };
};

const badgeStyles = (
  theme: Theme,
  kind: MetricCardBadgeKind,
): { background: string; color: string } => {
  const c = COLORS[theme];
  if (kind === "neutral") {
    return { background: c.CAPTIONS_BACKGROUND, color: c.WORD_COLOR_ON_BG_GREYED };
  }
  if (kind === "bad") {
    return { background: "rgba(220,38,38,0.10)", color: BENCHMARKS_PALETTE.trapMissedRed };
  }
  return { background: BENCHMARKS_PALETTE.topTierTint, color: BENCHMARKS_PALETTE.trapCaughtGreen };
};

/**
 * Theme-aware card for showcasing a single metric: eyebrow label + hero number
 * (count-up or spring-in) + optional subtitle + optional corner badge pill +
 * optional body-slot children + optional highlight border that crossfades to
 * ACCENT_COLOR after the number settles.
 *
 * Used across the Hook and Quality benchmark slides, so it lives as a shared
 * primitive rather than slide-local.
 */
export const MetricCard: React.FC<MetricCardProps> = (props) => {
  const {
    theme,
    x,
    y,
    size = "md",
    w,
    h,
    eyebrow,
    value,
    from = 0,
    format,
    hero = false,
    subtitle,
    badge,
    badgeKind = "good",
    children,
    enterFrame = 0,
    enterDurationFrames = DEFAULT_ENTER_DURATION,
    numberOffsetFrames = DEFAULT_NUMBER_OFFSET,
    numberDurationFrames = DEFAULT_NUMBER_DURATION,
  } = props;

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = COLORS[theme];

  const enterProgress = spring({
    fps,
    frame: frame - enterFrame,
    config: SPRING_UI,
    durationInFrames: enterDurationFrames,
  });

  const highlightStart =
    enterFrame + enterDurationFrames + numberOffsetFrames + numberDurationFrames;
  const highlightProgress = interpolate(
    frame,
    [highlightStart, highlightStart + HIGHLIGHT_DURATION],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const state = computeMetricCard(frame, enterProgress, highlightProgress, props);
  const cardW = w ?? (size === "lg" ? LG_W : MD_W);
  const cardH = h ?? (size === "lg" ? LG_H : MD_H);
  const numberSize = size === "lg" ? 88 : 56;
  const numberDelay = enterFrame + enterDurationFrames + numberOffsetFrames;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: cardW,
        height: cardH,
        background: c.BACKGROUND_ELEVATED,
        border: `1px solid ${state.borderColor}`,
        borderRadius: 16,
        padding: 24,
        opacity: state.opacity,
        transform: `translateY(${state.translateY}px) scale(${state.scale})`,
        transformOrigin: "top left",
        boxSizing: "border-box",
      }}
    >
      {badge ? (
        <div
          style={{
            ...MONOSPACE_FONT,
            position: "absolute",
            top: 16,
            right: 16,
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 11,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            ...badgeStyles(theme, badgeKind),
          }}
        >
          {badge}
        </div>
      ) : null}

      <div
        style={{
          ...MONOSPACE_FONT,
          fontSize: 12,
          color: c.WORD_COLOR_ON_BG_GREYED,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {eyebrow}
      </div>

      <div
        style={{
          ...TITLE_FONT,
          fontSize: numberSize,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: c.WORD_COLOR_ON_BG_APPEARED,
          fontVariantNumeric: "tabular-nums",
          marginBottom: 12,
          lineHeight: 0.95,
        }}
      >
        {hero ? (
          <ScaleInNumber
            value={format ? format(value) : String(value)}
            delay={numberDelay}
          />
        ) : (
          <CountUpNumber
            from={from}
            to={value}
            format={format}
            delay={numberDelay}
            durationInFrames={numberDurationFrames}
          />
        )}
      </div>

      {subtitle ? (
        <div
          style={{
            ...REGULAR_FONT,
            fontSize: 14,
            color: c.WORD_COLOR_ON_BG_GREYED,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      ) : null}

      {children ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
};
