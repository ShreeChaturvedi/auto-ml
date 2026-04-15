import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

/**
 * Default gradient reproduces the landing hero "agentically" look from
 * `landing/src/components/Hero.astro:202-209`.
 *
 * Band parked at center of a 4x-wide gradient so `background-position` can
 * sweep the bright window across the text over the cycle.
 */
const DEFAULT_SHIMMER_TEXT_GRADIENT =
  "linear-gradient(90deg, #a1a1a6 0%, #a1a1a6 42%, #E2E6ED 50%, #a1a1a6 58%, #a1a1a6 100%)";

export type ShimmerTextProps = {
  text: string;
  /** Frame at which the first sweep starts. Default 0. */
  startFrame?: number;
  /** Full cycle length in frames. Default 456 (7.6 s @ 60 fps). */
  cycleFrames?: number;
  /** CSS linear-gradient string (no trailing semicolon). */
  gradient?: string;
  style?: React.CSSProperties;
  className?: string;
};

/**
 * Metallic background-clip shimmer. Parks a 5-stop linear-gradient on top of
 * transparent text and sweeps `background-position` across the first 40% of
 * each cycle, then holds offscreen until the next cycle begins.
 */
export const ShimmerText: React.FC<ShimmerTextProps> = ({
  text,
  startFrame = 0,
  cycleFrames = 456,
  gradient = DEFAULT_SHIMMER_TEXT_GRADIENT,
  style,
  className,
}) => {
  const frame = useCurrentFrame();
  const t = ((frame - startFrame) % cycleFrames + cycleFrames) % cycleFrames;
  const positionX = interpolate(t, [0, cycleFrames * 0.4], [100, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <span
      className={className}
      style={{
        backgroundImage: gradient,
        backgroundSize: "400% 100%",
        backgroundPosition: `${positionX}% 50%`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        display: "inline-block",
        ...style,
      }}
    >
      {text}
    </span>
  );
};

export type ShimmerMaskProps = {
  text: string;
  /** Width of the outer SVG in CSS px. Default 1920. */
  width?: number;
  /** Height of the outer SVG in CSS px. Default 360. */
  height?: number;
  /** Font size in px. */
  fontSize: number;
  /** Cycle length in frames. Default 180 (3 s @ 60 fps). */
  cycleFrames?: number;
  /** Base color ramp stops (dark, mid, bright, mid, dark). */
  baseColor?: string;
  /** Shimmer band color for the visible-through-mask layer. */
  sheenColor?: string;
};

/**
 * SVG-mask shimmer for giant wordmarks. Ports the structure from
 * `landing/src/components/Footer.astro:107-164`:
 *   - Layer 1: wordmark with metallic base gradient stroke (always visible).
 *   - Layer 2: same wordmark with bright white stroke, masked by a moving
 *     band that slides from translateX(-25%) to translateX(75%) per cycle.
 *
 * Everything is driven by `useCurrentFrame` — no CSS animations so rendering
 * is deterministic frame-by-frame.
 */
export const ShimmerMask: React.FC<ShimmerMaskProps> = ({
  text,
  width = 1920,
  height = 360,
  fontSize,
  cycleFrames = 180,
  baseColor,
  sheenColor = "#F7F8F8",
}) => {
  const frame = useCurrentFrame();
  const t = ((frame % cycleFrames) + cycleFrames) % cycleFrames;
  const translatePct = interpolate(t, [0, cycleFrames], [-25, 75]);

  const baseId = React.useId().replace(/:/g, "-");
  const baseGradId = `${baseId}-base-grad`;
  const bandGradId = `${baseId}-sheen-band`;
  const maskId = `${baseId}-shine-mask`;

  // Default ramp mirrors Footer.astro's dark → silver → dark stops.
  const stops = baseColor ?? "#4d5056|#74777c|#9ea1a6|#74777c|#4d5056";
  const [s0, s1, s2, s3, s4] = stops.split("|");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={baseGradId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={width}
          y2="0"
        >
          <stop offset="0%" stopColor={s0} />
          <stop offset="25%" stopColor={s1} />
          <stop offset="50%" stopColor={s2} />
          <stop offset="75%" stopColor={s3} />
          <stop offset="100%" stopColor={s4} />
        </linearGradient>

        <linearGradient id={bandGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" />
          <stop offset="42%" stopColor="#000" />
          <stop offset="50%" stopColor="#fff" />
          <stop offset="58%" stopColor="#000" />
          <stop offset="100%" stopColor="#000" />
        </linearGradient>

        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-width * 0.17}
          y={-height * 0.55}
          width={width * 1.34}
          height={height * 1.95}
        >
          <g transform={`translate(${(translatePct / 100) * width * 2}, 0)`}>
            <rect
              x={-width}
              y={-height * 0.55}
              width={width * 2}
              height={height * 1.95}
              fill={`url(#${bandGradId})`}
            />
          </g>
        </mask>
      </defs>

      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fill="transparent"
        stroke={`url(#${baseGradId})`}
        strokeWidth={1.5}
      >
        {text}
      </text>

      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fill="transparent"
        stroke={sheenColor}
        strokeWidth={1.5}
        mask={`url(#${maskId})`}
      >
        {text}
      </text>
    </svg>
  );
};
