import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import {
  JOURNEY_LAYOUT,
  JOURNEY_PALETTE,
} from "../../../../config/journey-layout";
import { WEEKLY_BUCKETS, PEAK_WEEK } from "../../../../config/journey-content";
import { EASE_OUT } from "../../../../config/easing";
import { blendColor } from "../../../helpers/colorBlend";
import { BreathingHaloRing, NodeHaloRing } from "../../../primitives/NodeHaloRing";

/**
 * Pure keyframe calculator for one weekly bar on Slide 1's commit chart.
 * Exported so tests can drive it without a Remotion render context.
 */
export type CommitBarState = {
  /** Pixel height of the rising bar at this frame. */
  heightPx: number;
  /** Pixel y of the bar's top (grows upward from baseline). */
  topY: number;
  /** Filled color — base blended with sprint accent. */
  fill: string;
  /** True when the bar has fully risen. */
  settled: boolean;
};

export const computeCommitBar = (
  frame: number,
  i: number,
  peakHeightPx: number,
  peakCount: number,
  count: number,
  sprint: "foundation" | "agentic" | "production",
  risesAt: number,
  staggerFrames: number,
  riseDurationFrames: number,
): CommitBarState => {
  const enterAt = risesAt + i * staggerFrames;
  const exitAt = enterAt + riseDurationFrames;
  const progress = interpolate(frame, [enterAt, exitAt], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Floor at 10 px so low-count weeks (3-8 commits) read as proper short
  // bars instead of pixel slivers — the project started slow and the chart
  // has to convey that narrative, not erase it.
  const raw = peakCount > 0 ? (count / peakCount) * peakHeightPx : 0;
  const targetH = count > 0 ? Math.max(10, raw) : 0;
  const heightPx = progress * targetH;
  const accent =
    sprint === "foundation"
      ? JOURNEY_PALETTE.foundationAccent
      : sprint === "agentic"
        ? JOURNEY_PALETTE.agenticAccent
        : JOURNEY_PALETTE.productionAccent;
  const fill = blendColor(JOURNEY_PALETTE.barBase, accent, 0.18);
  return {
    heightPx,
    topY: JOURNEY_LAYOUT.axis.y - heightPx,
    fill,
    settled: frame >= exitAt,
  };
};

export type CommitBarRowProps = {
  /** Frame at which the first bar starts rising. */
  risesAt: number;
  /** Stagger between adjacent bars (default 2f). */
  staggerFrames?: number;
  /** Individual bar rise duration (default 22f). */
  riseDurationFrames?: number;
  /** Frame the peak-column halo starts firing. */
  peakHaloAt: number;
  /** Frame the peak-column breathing halo settles into its hold. */
  peakBreatheAt: number;
};

const DEFAULT_STAGGER = 2;
const DEFAULT_RISE = 22;

export const CommitBarRow: React.FC<CommitBarRowProps> = ({
  risesAt,
  staggerFrames = DEFAULT_STAGGER,
  riseDurationFrames = DEFAULT_RISE,
  peakHaloAt,
  peakBreatheAt,
}) => {
  const frame = useCurrentFrame();
  const { chart } = JOURNEY_LAYOUT;
  const n = WEEKLY_BUCKETS.length;
  const barStride = chart.w / n;
  const barW = Math.max(6, barStride - chart.barGap);
  // Position halos at the peak bar's left edge within the container.
  const peakX = PEAK_WEEK.weekIndex * barStride;

  // Peak bar fully settles at this frame; clamp both halos to fire only
  // AFTER the bar has finished rising so the ring never floats above an
  // in-flight bar top.
  const peakSettleFrame =
    risesAt + PEAK_WEEK.weekIndex * staggerFrames + riseDurationFrames;
  const safePeakHaloAt = Math.max(peakHaloAt, peakSettleFrame);
  const safePeakBreatheAt = Math.max(peakBreatheAt, peakSettleFrame);

  return (
    <div
      style={{
        position: "absolute",
        left: chart.x,
        top: 0,
        width: chart.w,
        height: JOURNEY_LAYOUT.axis.y,
        pointerEvents: "none",
      }}
    >
      {WEEKLY_BUCKETS.map((bucket, i) => {
        const state = computeCommitBar(
          frame,
          i,
          chart.peakHeightPx,
          PEAK_WEEK.count,
          bucket.count,
          bucket.sprint,
          risesAt,
          staggerFrames,
          riseDurationFrames,
        );
        const xInRow = i * barStride;
        const isPeak = i === PEAK_WEEK.weekIndex;
        return (
          <div
            key={bucket.week}
            style={{
              position: "absolute",
              left: xInRow,
              top: state.topY,
              width: barW,
              height: state.heightPx,
              background: state.fill,
              borderRadius: 2,
              // Only paint the 1 px peak outline when the bar has actual height;
              // otherwise it reads as a stray hairline at the axis.
              boxShadow:
                isPeak && state.heightPx > 0
                  ? "0 0 0 1px rgba(245,158,11,0.25)"
                  : "none",
            }}
          />
        );
      })}

      {/* One-shot halo on the peak bar when the callout lands.
       *  Small peakScale (1.05) keeps the ring tight around the bar — a
       *  larger scale visually overhangs the bar top by ~30px. */}
      {frame >= safePeakHaloAt ? (
        <NodeHaloRing
          x={peakX - 2}
          y={JOURNEY_LAYOUT.axis.y - chart.peakHeightPx}
          w={barW + 4}
          h={chart.peakHeightPx + 4}
          at={safePeakHaloAt}
          durationFrames={36}
          color={JOURNEY_PALETTE.productionAccent}
          peakScale={1.05}
          radius={4}
        />
      ) : null}

      {/* Continuous breathing halo during the hold. Guarded so it doesn't
       *  render at its baseline-opacity floor before the bar has settled. */}
      {frame >= safePeakBreatheAt ? (
        <BreathingHaloRing
          x={peakX - 2}
          y={JOURNEY_LAYOUT.axis.y - chart.peakHeightPx}
          w={barW + 4}
          h={chart.peakHeightPx + 4}
          at={safePeakBreatheAt}
          color={JOURNEY_PALETTE.productionAccent}
          minOpacity={0.08}
          maxOpacity={0.22}
          maxScale={1.01}
          periodFrames={120}
          radius={4}
        />
      ) : null}
    </div>
  );
};
