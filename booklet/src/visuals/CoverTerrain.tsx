import React from "react";
import { COLORS } from "../theme";
import { buildContourPaths } from "./topographyEngine";

/**
 * Algorithmic SVG topography — the cover's hero art. The front variant
 * biases a gaussian peak toward the 'A' mark so the apex contour visually
 * aligns with it; the back variant x-shifts the same noise field so the
 * two pages read as one continuous wraparound spread.
 *
 * Everything is vector — `<path>` strokes on a `PAPER_WARM` ground, a
 * single `<feTurbulence>` grain overlay at 9% alpha for texture. No
 * blend-modes, patterns, or masks (all unreliable in Chromium PDF).
 */

export type CoverTerrainProps = {
  widthIn: number;
  heightIn: number;
  variant: "front" | "back" | "endpaper";
  seed?: string;
  /**
   * When true, skip the grain filter and paper-warm ground so the SVG renders
   * as pure contour lines on transparent — suitable for use as a watermark
   * layered behind other content. Vignette also skipped.
   */
  lineOnly?: boolean;
  /** Global stroke opacity multiplier applied to every ring. Default 1. */
  strokeAlpha?: number;
};

const GRAIN_IDS: Record<"front" | "back" | "endpaper", string> = {
  front: "cover-grain-front",
  back: "cover-grain-back",
  endpaper: "cover-grain-endpaper",
};
const SEED_NUMS: Record<"front" | "back" | "endpaper", number> = {
  front: 1,
  back: 2,
  endpaper: 3,
};

export const CoverTerrain: React.FC<CoverTerrainProps> = ({
  widthIn,
  heightIn,
  variant,
  seed = "miami-cse-2026",
  lineOnly = false,
  strokeAlpha = 1,
}) => {
  const terrain = React.useMemo(
    () => buildContourPaths(seed, variant),
    [seed, variant],
  );

  // viewBox is locked to the engine's internal canvas (8.75×11.25 × 100);
  // widthIn/heightIn are API knobs reserved for future trim-size changes.
  void widthIn;
  void heightIn;

  const grainId = GRAIN_IDS[variant];

  return (
    <svg
      viewBox={`0 0 ${terrain.viewBoxW} ${terrain.viewBoxH}`}
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
      aria-hidden="true"
    >
      <defs>
        {!lineOnly && (
          <>
            {/* Editorial grain — newsprint-scale texture, not TV static. */}
            <filter
              id={grainId}
              x="-2%"
              y="-2%"
              width="104%"
              height="104%"
              filterUnits="objectBoundingBox"
              primitiveUnits="userSpaceOnUse"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="1.6"
                numOctaves={2}
                stitchTiles="stitch"
                seed={SEED_NUMS[variant]}
              />
              {/* Flatten channels to ink-black; alpha carries the grain at
                  ~10% — editorial newsprint texture, not TV static. */}
              <feColorMatrix
                values="0 0 0 0 0.09
                        0 0 0 0 0.09
                        0 0 0 0 0.09
                        0 0 0 0.1  0"
              />
            </filter>

            {/* Subtle paper-warm vignette — keeps the cover from feeling flat. */}
            <radialGradient
              id={`cover-vignette-${variant}`}
              cx="50%"
              cy={variant === "front" ? "30%" : "72%"}
              r="72%"
            >
              <stop offset="0%" stopColor={COLORS.PAPER_WARM} stopOpacity="0" />
              <stop offset="100%" stopColor={COLORS.INK} stopOpacity="0.06" />
            </radialGradient>
          </>
        )}
      </defs>

      {/* Paper ground — skipped in lineOnly mode so the SVG can layer on an
          existing page background. */}
      {!lineOnly && (
        <rect
          x={0}
          y={0}
          width={terrain.viewBoxW}
          height={terrain.viewBoxH}
          fill={COLORS.PAPER_WARM}
        />
      )}

      {/* Contour rings. opacity=0.99 avoids a known Chromium PDF bug where
          elements at opacity=1 are sometimes dropped entirely from output. */}
      <g opacity={0.99}>
        {terrain.paths.map((p) => (
          <path
            key={p.k}
            d={p.d}
            stroke={p.stroke}
            fill="none"
            strokeWidth={p.apex ? 1.4 : 0.95}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={(p.apex ? 1 : 0.9) * strokeAlpha}
          />
        ))}
      </g>

      {!lineOnly && (
        <>
          {/* Vignette sits above lines at low opacity — gives depth without
              washing out the contour rings. */}
          <rect
            x={0}
            y={0}
            width={terrain.viewBoxW}
            height={terrain.viewBoxH}
            fill={`url(#cover-vignette-${variant})`}
            pointerEvents="none"
          />

          {/* Grain — last, so it lands on both lines and ground. */}
          <rect
            x={0}
            y={0}
            width={terrain.viewBoxW}
            height={terrain.viewBoxH}
            filter={`url(#${grainId})`}
            pointerEvents="none"
            opacity={0.85}
          />
        </>
      )}
    </svg>
  );
};

// Useful for callers that want to pin decorations to the exact peak.
export { buildContourPaths } from "./topographyEngine";
