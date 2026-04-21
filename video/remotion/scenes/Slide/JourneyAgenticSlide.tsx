import React from "react";
import { JOURNEY_PALETTE } from "../../../config/journey-layout";
import { AGENTIC_PILL_LABEL } from "../../../config/journey-content";
import { MONOSPACE_FONT } from "../../../config/fonts";
import { MotionLine } from "../../primitives/MotionLine";
import { JourneyRangeShell } from "./journey/JourneyRangeShell";
import type { SlideBodyProps } from "./index";

/**
 * Slide 3 — The Agentic Turn (Sprints 5-8). Header marker morphs accentBlue →
 * successGreenBright. Hero moment is a "55 / 324 issues labelled" pill with a
 * leader line pointing back to the Issues MetricCard so the reader reads the
 * pill as a callout on the middle card, not a floating tag.
 *
 * Geometry anchors:
 *   - Issues card: slide (540..920, 360..580). Bottom-center = (730, 580).
 *   - Hero-moment slot: slide origin (960, 680). Children use negative offsets
 *     to escape the slot and terminate ON the Issues card.
 *   - Leader SVG origin = slot (-230, -100) = slide (730, 580) = card bottom.
 *   - Pill rendered at slot (110, 70) = slide (1070, 750), so the leader runs
 *     from (0, 0) → (340, 170) inside the SVG and lands on the pill's left
 *     edge middle.
 */
export const JourneyAgenticSlide: React.FC<SlideBodyProps> = ({ theme }) => (
  <JourneyRangeShell
    theme={theme}
    range="agentic"
    heroMoment={
      <>
        {/* Leader — anchored to Issues-card bottom-center, sweeping down-right
         *  to the pill. Negative offsets reach outside the slot bounds. */}
        <div
          style={{
            position: "absolute",
            left: -230,
            top: -100,
            width: 360,
            height: 180,
            pointerEvents: "none",
          }}
        >
          <MotionLine
            x1={0}
            y1={0}
            x2={340}
            y2={170}
            delay={10}
            durationInFrames={30}
            color={JOURNEY_PALETTE.agenticAccent}
            strokeWidth={2}
            svgWidth={360}
            svgHeight={180}
          />
        </div>

        {/* Pill — sits where the leader terminates. */}
        <div
          style={{
            position: "absolute",
            left: 110,
            top: 58,
            padding: "10px 18px",
            background: JOURNEY_PALETTE.agenticAccent,
            color: "#FFFFFF",
            borderRadius: 999,
            ...MONOSPACE_FONT,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.04em",
            boxShadow: "0 6px 16px rgba(16,185,129,0.25)",
            whiteSpace: "nowrap",
          }}
        >
          {AGENTIC_PILL_LABEL}
        </div>
      </>
    }
  />
);
