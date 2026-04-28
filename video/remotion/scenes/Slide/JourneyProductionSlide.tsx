import React from "react";
import { JOURNEY_PALETTE } from "../../../config/journey-layout";
import { PRODUCTION_HERO } from "../../../config/journey-content";
import { MONOSPACE_FONT, TITLE_FONT } from "../../../config/fonts";
import { ARCH_PALETTE } from "../../../config/arch-layout";
import { NodeHaloRing } from "../../primitives/NodeHaloRing";
import { ScaleInNumber } from "../../primitives/ScaleInNumber";
import { JourneyRangeShell } from "./journey/JourneyRangeShell";
import type { SlideBodyProps } from "./index";

/**
 * Slide 4 — Production & Demo (Sprints 9-11). Header marker morphs
 * successGreenBright → amberBright. Hero moment is the `ScaleInNumber "151"`
 * (this slide's sole SPRING_HERO) with an amber halo pulse.
 */
export const JourneyProductionSlide: React.FC<SlideBodyProps> = ({ theme }) => (
  <JourneyRangeShell
    theme={theme}
    range="production"
    heroMoment={
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          paddingTop: 20,
        }}
      >
        {/* Halo ring wraps the 151 numeral. The hero moment enters at slide
         *  frame 390 (P6); fire the halo at 410 (20f after ScaleInNumber
         *  settles) so it reads as a punctuating pulse. `at` is in slide-
         *  absolute frames; useCurrentFrame inside NodeHaloRing returns the
         *  Sequence-local frame, which matches. */}
        <NodeHaloRing
          x={100}
          y={10}
          w={340}
          h={150}
          at={410}
          durationFrames={36}
          color={JOURNEY_PALETTE.productionAccent}
          peakScale={1.22}
          radius={14}
          strokeWidth={3}
        />
        <div
          style={{
            ...TITLE_FONT,
            fontWeight: 700,
            fontSize: 152,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            color: ARCH_PALETTE.ink,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <ScaleInNumber value={PRODUCTION_HERO.value} delay={400} />
        </div>
        <div
          style={{
            ...MONOSPACE_FONT,
            fontSize: 14,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: ARCH_PALETTE.mute,
            marginTop: 14,
          }}
        >
          {PRODUCTION_HERO.caption}
        </div>
      </div>
    }
  />
);
