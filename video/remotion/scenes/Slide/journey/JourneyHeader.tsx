import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import {
  JOURNEY_LAYOUT,
  JOURNEY_PALETTE,
  RANGE_ACCENT,
  type JourneyRange,
} from "../../../../config/journey-layout";
import { RANGE_STATS } from "../../../../config/journey-content";
import { EASE_OUT } from "../../../../config/easing";
import { MONOSPACE_FONT } from "../../../../config/fonts";
import { blendColor } from "../../../helpers/colorBlend";

/**
 * Shared 3-cell sprint-band header baked into Slides 1-4. Geometry is
 * pixel-identical across slides; the active-range marker position + color
 * morph via `blendColor` in the first 30f of each slide so the reader
 * perceives one continuous pill translating + recoloring across cuts.
 */
export type JourneyHeaderProps = {
  /** Which range is active on THIS slide. "pulse" marks the full 3-cell span. */
  activeRange: JourneyRange;
  /** The previous slide's active range — used to morph color on entry.
   *  Slide 1 (pulse) has no predecessor; pass "pulse". */
  previousRange: JourneyRange;
  /** Opacity override (so parent shell fade cascades to the header). */
  opacity?: number;
};

const ACTIVE_LABEL_COLOR = "#171717";
const DIM_LABEL_COLOR = "rgba(23, 23, 23, 0.45)";

/** Cells (label, rangeKey) in display order — mirrors `journey-content.RANGE_STATS`. */
const CELLS: ReadonlyArray<{ key: JourneyRange; label: string }> = [
  { key: "foundation", label: RANGE_STATS.foundation.label },
  { key: "agentic", label: RANGE_STATS.agentic.label },
  { key: "production", label: RANGE_STATS.production.label },
];

export const JourneyHeader: React.FC<JourneyHeaderProps> = ({
  activeRange,
  previousRange,
  opacity = 1,
}) => {
  const frame = useCurrentFrame();
  const { header } = JOURNEY_LAYOUT;

  // Marker color morph over the first 30 frames of the slide.
  const t = interpolate(frame, [0, 30], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const markerColor = blendColor(
    RANGE_ACCENT[previousRange],
    RANGE_ACCENT[activeRange],
    t,
  );

  // Marker x/w. Slide 1 (pulse) spans all 3 cells; Slides 2-4 sit under their cell.
  const markerX =
    activeRange === "pulse"
      ? header.pulseMarkerX
      : header.cellX[CELLS.findIndex((c) => c.key === activeRange)]!;
  const markerW =
    activeRange === "pulse" ? header.pulseMarkerW : header.cellW;

  return (
    <div style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      {CELLS.map((cell) => {
        const isActive = activeRange === cell.key || activeRange === "pulse";
        const idx = CELLS.findIndex((c) => c.key === cell.key);
        return (
          <div
            key={cell.key}
            style={{
              position: "absolute",
              left: header.cellX[idx],
              top: header.cellY,
              width: header.cellW,
              height: header.cellH,
              display: "flex",
              alignItems: "center",
              paddingLeft: 12,
              paddingRight: 12,
              boxSizing: "border-box",
              ...MONOSPACE_FONT,
              fontSize: 13,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: isActive ? ACTIVE_LABEL_COLOR : DIM_LABEL_COLOR,
              borderTop: `1px solid ${JOURNEY_PALETTE.gridHairline}`,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {cell.label}
          </div>
        );
      })}

      {/* Active-range marker — 2-px underline that translates + recolors
       *  across slide boundaries. */}
      <div
        style={{
          position: "absolute",
          left: markerX,
          top: header.markerY,
          width: markerW,
          height: header.markerH,
          background: markerColor,
          borderRadius: 1,
        }}
      />
    </div>
  );
};
