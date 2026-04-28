import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_OUT, SPRING_UI } from "../../config/easing";
import { MONOSPACE_FONT } from "../../config/fonts";
import { ARCH_PALETTE } from "../../config/arch-layout";
import { CountUpNumber } from "./CountUpNumber";

export type CounterCell = {
  /** Display text under the number (e.g. `workflow_runs`). */
  label: string;
  /** Final number the count-up ramps to. */
  to: number;
  /** Custom formatter — defaults to `Intl.NumberFormat`. */
  format?: (value: number) => string;
};

export type CounterStripProps = {
  /** Cells rendered left-to-right. */
  cells: CounterCell[];
  /** Top-left origin. */
  x: number;
  y: number;
  /** Per-card width. Default 260. */
  cardW?: number;
  /** Per-card height. Default 136. */
  cardH?: number;
  /** Gap between cards. Default 30. */
  gap?: number;
  /** Frame at which the first card lands. Default 0. */
  startFrame?: number;
  /** Frames between adjacent card landings. Default 30. */
  staggerFrames?: number;
  /** Card enter duration. Default 24. */
  enterDurationFrames?: number;
  /** Delay between card landing and its count-up starting. Default 48. */
  countUpOffsetFrames?: number;
  /** Count-up ramp duration. Default 36. */
  countUpDurationFrames?: number;
};

const defaultFormatter = (n: number) =>
  new Intl.NumberFormat("en-US").format(Math.round(n));

/**
 * Row of counter cards used by Scene 6's Postgres ledger reveal. Each card
 * lands via SPRING_UI stagger, then its count-up fires `countUpOffsetFrames`
 * later so the number reads as a data-populating moment rather than
 * contemporaneous noise.
 *
 * Purpose-built for ledger/table-style telemetry — for the TechStackSlide
 * telemetry strip (with green underline variants), keep the existing
 * implementation; they are structurally different UIs.
 */
export const CounterStrip: React.FC<CounterStripProps> = (props) => {
  const {
    cells,
    x,
    y,
    cardW = 260,
    cardH = 136,
    gap = 30,
    startFrame = 0,
    staggerFrames = 30,
    enterDurationFrames = 24,
    countUpOffsetFrames = 48,
    countUpDurationFrames = 36,
  } = props;

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ position: "absolute", left: x, top: y }}>
      {cells.map((cell, i) => {
        const landFrame = startFrame + i * staggerFrames;
        const enter = spring({
          fps,
          frame: frame - landFrame,
          config: SPRING_UI,
          durationInFrames: enterDurationFrames,
        });
        const opacity = interpolate(enter, [0, 1], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const translateY = interpolate(enter, [0, 1], [16, 0], {
          easing: EASE_OUT,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={cell.label}
            style={{
              position: "absolute",
              left: i * (cardW + gap),
              top: 0,
              width: cardW,
              height: cardH,
              background: ARCH_PALETTE.paper,
              border: `1px solid ${ARCH_PALETTE.hairline}`,
              borderRadius: 12,
              boxShadow: "0 8px 24px -6px rgba(0,0,0,0.06)",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              opacity,
              transform: `translateY(${translateY}px)`,
            }}
          >
            <div
              style={{
                fontFamily: MONOSPACE_FONT.fontFamily,
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                color: ARCH_PALETTE.ink,
              }}
            >
              <CountUpNumber
                from={0}
                to={cell.to}
                format={cell.format ?? defaultFormatter}
                delay={landFrame + countUpOffsetFrames}
                durationInFrames={countUpDurationFrames}
              />
            </div>
            <div
              style={{
                fontFamily: MONOSPACE_FONT.fontFamily,
                fontSize: 13,
                fontWeight: 500,
                color: ARCH_PALETTE.mute,
                letterSpacing: "0.02em",
              }}
            >
              {cell.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};
