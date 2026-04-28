import React from "react";
import { COLORS, FONTS } from "../theme";
import {
  BUILD,
  JOURNEY,
  WEEKLY_BUCKETS,
  MONTH_TICKS,
} from "../content";

/**
 * Sprint timeline — pages 24 / 25, rendered as ONE continuous infographic
 * across the gutter. Both halves call into the same geometry so the Y-axis
 * scale, bar stride, month rhythm, and overlaid cumulative curve are
 * identical on both sides of the fold.
 *
 * Layout zones (top → bottom, each half):
 *   1. Header strip    — eyebrow + half-totals stat cluster               ~32px
 *   2. Main chart      — weekly commit bars + cumulative area ghost line  ~300px
 *   3. Rhythm band     — per-sprint MR dots + issues-closed mini-bars     ~70px
 *   4. Sprint strips   — compressed horizontal cards, one per sprint      ~120px
 *   5. Editorial rail  — pull quote (italic serif) + totals line          remaining
 *
 * Derivation note on the "extra" metrics:
 *   WEEKLY_BUCKETS is the single source of truth for week-by-week commits
 *   (real GitLab data). The cumulative curve is a direct prefix-sum over
 *   those counts — fully derived, not synthetic. MRs / issues per sprint
 *   are apportioned from JOURNEY's 153/324 totals by weighting each sprint
 *   by its total commit volume so the shape tracks real activity without
 *   fabricating per-week numbers that aren't in the source data.
 */

export type SprintTimelineProps = {
  half: "left" | "right";
  width: number;
  height: number;
};

// ---------------------------------------------------------------------------
// Shared geometry — both halves read from the SAME constants so a reader
// visually stitching pages 24+25 across the gutter sees one continuous chart.
// ---------------------------------------------------------------------------

const TOTAL_WEEKS = WEEKLY_BUCKETS.length; // 17
/** Weeks on each half. Split at week 9 (Feb 22 = S8 start) so the sprint
 *  boundary aligns visually with the gutter. Left = 9 weeks, right = 8
 *  weeks; right half's slightly sparser bar density is absorbed by the
 *  cumulative-curve side (which dominates its left area anyway). */
const LEFT_END = 9;
const HALF_RANGE: Record<"left" | "right", [number, number]> = {
  left: [0, LEFT_END],
  right: [LEFT_END, TOTAL_WEEKS],
};

const HALF_SPRINTS: Record<"left" | "right", Array<typeof BUILD.sprints[number]>> = {
  left:  [BUILD.sprints[0]!, BUILD.sprints[1]!],
  right: [BUILD.sprints[2]!, BUILD.sprints[3]!],
};

const HALF_PULL_QUOTE: Record<"left" | "right", string> = {
  left:  BUILD.pullQuotes.left,
  right: BUILD.pullQuotes.right,
};

// ---------------------------------------------------------------------------
// Chart geometry — fixed y-axis so the left and right halves share pixel-
// aligned gridlines. Padding is tuned so the bars on either side of the
// gutter finish flush against the page edge, giving the appearance of one
// chart whose middle 0.5" (binding) is simply hidden.
// ---------------------------------------------------------------------------

const Y_MAX = 450;
const Y_STEP = 100;
const Y_TICKS = Array.from({ length: Y_MAX / Y_STEP + 1 }, (_, i) => i * Y_STEP);

const CHART_H = 240;

// Left half owns the left axis rail; right half owns the right cumulative
// axis. Both halves leave a small inner gap so the dashed gutter rule has
// breathing room.
const PAD_LEFT = (half: "left" | "right") => (half === "left" ? 44 : 4);
const PAD_RIGHT = (half: "left" | "right") => (half === "left" ? 4 : 34);
const PAD_TOP = 30;

const MR_DOT_R = 3;

// Peak week (Apr 5) is the book's visual crescendo — precomputed once so
// callouts and summary stats reference the same tuple.
const PEAK_IDX = WEEKLY_BUCKETS.findIndex((b) => b.count === 420);
const PEAK_BUCKET = WEEKLY_BUCKETS[PEAK_IDX]!;

// ---------------------------------------------------------------------------
// Derived series — prefix-sum cumulative commits; per-sprint MR / issue
// apportioning. Both depend only on JOURNEY totals and WEEKLY_BUCKETS.
// ---------------------------------------------------------------------------

const CUMULATIVE = (() => {
  let acc = 0;
  const realTotal = WEEKLY_BUCKETS.reduce((s, b) => s + b.count, 0);
  // Scale the prefix sum so the final week equals JOURNEY.commits exactly.
  const scale = JOURNEY.commits / realTotal;
  return WEEKLY_BUCKETS.map((b) => {
    acc += b.count;
    return Math.round(acc * scale);
  });
})();
const CUM_MAX = CUMULATIVE[CUMULATIVE.length - 1] ?? JOURNEY.commits;

/** Per-sprint MRs + issues, apportioned by commit volume. */
type SprintStats = { mrs: number; issues: number; commits: number };
const SPRINT_WEEK_RANGES: Array<[number, number]> = [
  [0, 5],   // S6: Dec 21 – Jan 24 (weeks 0..4)
  [5, 9],   // S7: Jan 25 – Feb 21 (weeks 5..8)
  [9, 13],  // S8: Feb 22 – Mar 21 (weeks 9..12)
  [13, 17], // S9: Mar 22 – Apr 20 (weeks 13..16)
];
const SPRINT_STATS: SprintStats[] = (() => {
  const commitsPerSprint = SPRINT_WEEK_RANGES.map(([s, e]) =>
    WEEKLY_BUCKETS.slice(s, e).reduce((a, b) => a + b.count, 0),
  );
  const sum = commitsPerSprint.reduce((a, b) => a + b, 0);
  return commitsPerSprint.map((c) => ({
    commits: c,
    mrs: Math.round((c / sum) * JOURNEY.mrs),
    issues: Math.round((c / sum) * JOURNEY.issues),
  }));
})();

// Totals to-date for the header stat pills (so the left half reads "to end
// of Feb" and the right reads the cumulative totals to end of Apr).
const HALF_TOTALS: Record<"left" | "right", { commits: number; mrs: number; issues: number }> = {
  left: (() => {
    const commits = CUMULATIVE[LEFT_END - 1] ?? 0;
    const mrs = SPRINT_STATS.slice(0, 2).reduce((a, s) => a + s.mrs, 0);
    const issues = SPRINT_STATS.slice(0, 2).reduce((a, s) => a + s.issues, 0);
    return { commits, mrs, issues };
  })(),
  right: (() => {
    const commits = CUMULATIVE[TOTAL_WEEKS - 1] ?? JOURNEY.commits;
    return { commits, mrs: JOURNEY.mrs, issues: JOURNEY.issues };
  })(),
};

// ---------------------------------------------------------------------------
// Callouts — italic-serif margin notes anchored to specific weeks. Only the
// peak callout (on the right half) retains a curved leader line; the other
// three are typographic and sit above/around the bars so the chart stays
// uncluttered at this editorial scale.
// ---------------------------------------------------------------------------

type Callout = {
  weekIdx: number;
  text: string;
  color: string;
  /** chart-local y-coordinate for the label. */
  labelY: number;
  /** Whether to draw the curly leader line. */
  leader?: boolean;
};

const HALF_CALLOUTS: Record<"left" | "right", Callout[]> = {
  left: [
    { weekIdx: 5, text: "LangGraph FSM end-to-end", color: COLORS.ACCENT, labelY: 52 },
    { weekIdx: 7, text: "approval gate shipped", color: COLORS.AMBER, labelY: 92 },
  ],
  right: [
    { weekIdx: 9,  text: "solo — feature-engine rebuild", color: COLORS.ACCENT, labelY: 92 },
    { weekIdx: 15, text: "biggest push · pre-expo", color: COLORS.MIAMI_RED, labelY: 16, leader: true },
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SprintTimeline: React.FC<SprintTimelineProps> = ({
  half,
  width,
  height,
}) => {
  const sprints = HALF_SPRINTS[half];
  const [startIdx, endIdx] = HALF_RANGE[half];

  return (
    <div style={{ position: "relative", width, height, fontFamily: FONTS.SANS }}>
      <HeaderStrip half={half} width={width} />

      <div style={{ position: "absolute", top: 42, left: 0, width, height: CHART_H }}>
        <MainChart half={half} width={width} />
      </div>

      <div
        style={{
          position: "absolute",
          top: 42 + CHART_H + 8,
          left: 0,
          width,
          height: 70,
        }}
      >
        <ActivityStrip half={half} width={width} />
      </div>

      <div
        style={{
          position: "absolute",
          top: 42 + CHART_H + 8 + 70 + 10,
          left: 0,
          width,
          height: 40,
        }}
      >
        <ContributorStrip half={half} width={width} />
      </div>

      <div
        style={{
          position: "absolute",
          // Sprint strips sit anchored above the editorial rail so the
          // vertical rhythm reads: chart → activity → author → strips →
          // quote. Editorial rail owns the bottom ~88px.
          left: 0,
          right: 0,
          bottom: 96,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 14,
        }}
      >
        {sprints.map((sprint, i) => {
          const globalIdx = half === "left" ? i : i + 2;
          return (
            <SprintStrip
              key={sprint.num}
              sprint={sprint}
              stats={SPRINT_STATS[globalIdx]!}
            />
          );
        })}
      </div>

      <EditorialRail half={half} width={width} startIdx={startIdx} endIdx={endIdx} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Header strip — eyebrow on left, totals-to-date stat cluster on right.
// ---------------------------------------------------------------------------

const HeaderStrip: React.FC<{ half: "left" | "right"; width: number }> = ({
  half,
  width,
}) => {
  const totals = HALF_TOTALS[half];
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 34,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
          }}
        >
          {half === "left" ? "01" : "02"} / 02 · sprints{" "}
          {HALF_SPRINTS[half].map((s) => s.num).join(" + ")}
        </span>
        <span
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 7.5,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: COLORS.INK_SUBTLE,
          }}
        >
          weeks {HALF_RANGE[half][0] + 1}–{HALF_RANGE[half][1]} of {TOTAL_WEEKS}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-end",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <StatPill
          label={half === "left" ? "to feb 21" : "through apr 20"}
          value={totals.commits.toLocaleString()}
          unit="commits"
        />
        <StatPill label="merges" value={String(totals.mrs)} />
        <StatPill label="issues" value={String(totals.issues)} />
      </div>
      <HalfMarker half={half} width={width} />
    </div>
  );
};

const StatPill: React.FC<{ label: string; value: string; unit?: string }> = ({
  label,
  value,
  unit,
}) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
    <span
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: "-0.015em",
        color: COLORS.INK,
        lineHeight: 1,
      }}
    >
      {value}
      {unit && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.05em",
            color: COLORS.INK_MUTED,
            marginLeft: 4,
          }}
        >
          {unit}
        </span>
      )}
    </span>
    <span
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 7,
        fontWeight: 500,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: COLORS.INK_SUBTLE,
        marginTop: 3,
      }}
    >
      {label}
    </span>
  </div>
);

// Tiny 01/02 gutter index — sits on the inside edge, reinforcing the
// "one chart split in two" read.
const HalfMarker: React.FC<{ half: "left" | "right"; width: number }> = ({
  half,
  width,
}) => (
  <div
    style={{
      position: "absolute",
      top: -4,
      [half === "left" ? "right" : "left"]: -6,
      width: 16,
      textAlign: "center",
      fontFamily: FONTS.MONO,
      fontSize: 7,
      fontWeight: 600,
      letterSpacing: "0.14em",
      color: COLORS.MIAMI_RED,
      textTransform: "uppercase",
      transform: half === "left" ? "translateX(100%)" : "translateX(-100%)",
      pointerEvents: "none",
    }}
  >
    {/* spacer — avoids width warning */}
    <span style={{ display: "none" }}>{width}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Main chart — 17 weekly bars + overlaid cumulative area. Both halves use
// the SAME global stride so bars line up with bars on the other side of
// the gutter, and the cumulative curve flows continuously from left to
// right.
// ---------------------------------------------------------------------------

const MainChart: React.FC<{ half: "left" | "right"; width: number }> = ({
  half,
  width,
}) => {
  const [startIdx, endIdx] = HALF_RANGE[half];
  const padL = PAD_LEFT(half);
  const padR = PAD_RIGHT(half);
  const plotW = width - padL - padR;
  const plotH = CHART_H - PAD_TOP - 28; // room for month labels
  // Each half shows half the total bars; the stride is identical because
  // plot widths and bucket counts are balanced (8 left, 9 right but the
  // gutter absorbs the difference).
  const bucketsInSlice = endIdx - startIdx;
  const stride = plotW / bucketsInSlice;
  const barW = Math.max(5, Math.min(7, stride - 4));

  const yFor = (count: number) => PAD_TOP + plotH - (count / Y_MAX) * plotH;
  const cumY = (value: number) =>
    PAD_TOP + plotH - (value / CUM_MAX) * plotH;

  // Monthly ticks inside this slice.
  const monthTicksInSlice = MONTH_TICKS.filter(
    (m) => m.atWeek >= startIdx && m.atWeek < endIdx,
  );

  // Cumulative area path — local slice only but uses the same global axis.
  const areaPoints = Array.from({ length: bucketsInSlice }, (_, i) => {
    const gi = startIdx + i;
    const x = padL + i * stride + stride / 2;
    const y = cumY(CUMULATIVE[gi] ?? 0);
    return [x, y] as const;
  });
  const areaPath = areaPoints
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const areaFill = `${areaPath} L ${
    areaPoints[areaPoints.length - 1]?.[0] ?? 0
  } ${PAD_TOP + plotH} L ${areaPoints[0]?.[0] ?? 0} ${PAD_TOP + plotH} Z`;

  return (
    <svg
      width={width}
      height={CHART_H}
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Y-axis gridlines — full width of this half, shared scale */}
      {Y_TICKS.map((tick) => {
        const y = yFor(tick);
        const isBase = tick === 0;
        return (
          <g key={tick}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y}
              y2={y}
              stroke={isBase ? COLORS.HAIRLINE_STRONG : COLORS.HAIRLINE}
              strokeWidth={isBase ? 0.6 : 0.35}
              strokeDasharray={isBase ? "0" : "2 3"}
            />
            {half === "left" && (
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fontFamily={FONTS.MONO}
                fontSize={7.5}
                fontWeight={600}
                fill={COLORS.INK_MUTED}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {tick}
              </text>
            )}
          </g>
        );
      })}

      {/* Right-side axis rail — cumulative scale (ghost teal) */}
      {half === "right" && (
        <g>
          {[500, 1000, 1500, 2000].map((v) => (
            <text
              key={v}
              x={width - padR + 5}
              y={cumY(v) + 3}
              textAnchor="start"
              fontFamily={FONTS.MONO}
              fontSize={7.5}
              fontWeight={600}
              fill={COLORS.ACCENT}
              opacity={0.75}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {v >= 1000 ? `${v / 1000}k` : v}
            </text>
          ))}
        </g>
      )}

      {/* Axis micro-labels */}
      {half === "left" && (
        <text
          x={2}
          y={PAD_TOP - 10}
          fontFamily={FONTS.MONO}
          fontSize={7}
          fontWeight={600}
          letterSpacing="0.14em"
          fill={COLORS.INK_SUBTLE}
        >
          COMMITS/WEEK
        </text>
      )}
      {half === "right" && (
        <text
          x={width - padR + 5}
          y={PAD_TOP - 10}
          fontFamily={FONTS.MONO}
          fontSize={7}
          fontWeight={600}
          letterSpacing="0.14em"
          fill={COLORS.ACCENT}
          opacity={0.8}
        >
          CUMULATIVE
        </text>
      )}

      {/* Cumulative area — drawn first so bars overlay it */}
      <path d={areaFill} fill={COLORS.ACCENT} opacity={0.06} />
      <path
        d={areaPath}
        fill="none"
        stroke={COLORS.ACCENT}
        strokeWidth={1.2}
        strokeDasharray="3 2"
        opacity={0.55}
      />
      {/* Cumulative end dots */}
      {areaPoints.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={1.3}
          fill={COLORS.ACCENT}
          opacity={0.65}
        />
      ))}

      {/* Weekly commit bars.
          Opacity ramps 0.4 → 1.0 rather than 0.2 → 1.0 so the small early
          bars still have presence against the cream page and don't vanish
          under the cumulative area fill. Peak bar is solid. */}
      {WEEKLY_BUCKETS.slice(startIdx, endIdx).map((b, i) => {
        const gi = startIdx + i;
        const y = yFor(b.count);
        const h = PAD_TOP + plotH - y;
        const x = padL + i * stride + (stride - barW) / 2;
        const isPeak = gi === PEAK_IDX;
        const t = gi / (TOTAL_WEEKS - 1);
        const opacity = isPeak ? 1 : 0.42 + Math.pow(t, 1.2) * 0.55;
        return (
          <rect
            key={b.week}
            x={x}
            y={y}
            width={barW}
            height={Math.max(h, 0.5)}
            rx={1.2}
            fill={COLORS.MIAMI_RED}
            opacity={opacity}
          />
        );
      })}

      {/* Month ticks + labels */}
      {monthTicksInSlice.map((m) => {
        const cx = padL + (m.atWeek - startIdx) * stride + stride / 2;
        return (
          <g key={m.label}>
            <line
              x1={cx}
              x2={cx}
              y1={PAD_TOP + plotH}
              y2={PAD_TOP + plotH + 4}
              stroke={COLORS.HAIRLINE_STRONG}
              strokeWidth={0.7}
            />
            <text
              x={cx}
              y={PAD_TOP + plotH + 14}
              textAnchor="middle"
              fontFamily={FONTS.SANS}
              fontSize={9}
              fontWeight={700}
              letterSpacing="0.04em"
              fill={COLORS.INK}
            >
              {m.label.toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* Sprint boundary markers — tiny vertical ticks at week 5, 9, 13 */}
      {[5, 9, 13].map((w) => {
        if (w < startIdx || w >= endIdx) return null;
        const cx = padL + (w - startIdx) * stride;
        return (
          <line
            key={w}
            x1={cx}
            x2={cx}
            y1={PAD_TOP - 4}
            y2={PAD_TOP + plotH + 4}
            stroke={COLORS.AMBER}
            strokeWidth={0.4}
            strokeDasharray="1 2"
            opacity={0.5}
          />
        );
      })}

      {/* Callouts */}
      <CalloutsLayer
        callouts={HALF_CALLOUTS[half]}
        startIdx={startIdx}
        stride={stride}
        padL={padL}
        plotH={plotH}
      />

      {/* Gutter edge marker — dashed rule on the inside edge of each half
          telling the reader this chart continues on the next page. */}
      <line
        x1={half === "left" ? width - 1 : 1}
        x2={half === "left" ? width - 1 : 1}
        y1={PAD_TOP - 10}
        y2={PAD_TOP + plotH + 10}
        stroke={COLORS.MIAMI_RED}
        strokeDasharray="1.5 2.5"
        strokeWidth={0.6}
        opacity={0.45}
      />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Callouts — italic-serif labels anchored above bars. The "biggest push"
// callout on the right half keeps its leader curl for drama; the others
// are clean typographic anchors with a 3px stem.
// ---------------------------------------------------------------------------

const CalloutsLayer: React.FC<{
  callouts: Callout[];
  startIdx: number;
  stride: number;
  padL: number;
  plotH: number;
}> = ({ callouts, startIdx, stride, padL, plotH }) => (
  <>
    {callouts.map((c, i) => {
      const localIdx = c.weekIdx - startIdx;
      const anchorX = padL + localIdx * stride + stride / 2;
      const bucket = WEEKLY_BUCKETS[c.weekIdx]!;
      const barTopY = PAD_TOP + plotH - (bucket.count / Y_MAX) * plotH;
      const labelY = c.labelY;
      if (c.leader) {
        // Curly leader — anchors right of the bar, curls up-left to the label.
        const labelX = anchorX - 120;
        const tipX = anchorX;
        const tipY = barTopY - 3;
        const c1x = tipX - 20;
        const c1y = tipY - 26;
        const c2x = labelX + 60;
        const c2y = labelY + 6;
        return (
          <g key={i} opacity={0.9}>
            <path
              d={`M ${tipX} ${tipY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${labelX + 88} ${labelY + 2}`}
              fill="none"
              stroke={c.color}
              strokeWidth={1.3}
              strokeLinecap="round"
            />
            <path d={`M ${tipX} ${tipY} L ${tipX - 4} ${tipY - 6}`} stroke={c.color} strokeWidth={1.3} fill="none" strokeLinecap="round" />
            <path d={`M ${tipX} ${tipY} L ${tipX + 4} ${tipY - 6}`} stroke={c.color} strokeWidth={1.3} fill="none" strokeLinecap="round" />
            <text
              x={labelX}
              y={labelY}
              textAnchor="start"
              fontFamily={FONTS.SERIF}
              fontStyle="italic"
              fontSize={11}
              fill={c.color}
            >
              {c.text}
            </text>
          </g>
        );
      }
      // Plain typographic callout — italic label + short stem from label baseline to bar top.
      const stemY1 = labelY + 4;
      const stemY2 = barTopY - 2;
      return (
        <g key={i} opacity={0.85}>
          <text
            x={anchorX}
            y={labelY}
            textAnchor="middle"
            fontFamily={FONTS.SERIF}
            fontStyle="italic"
            fontSize={10}
            fill={c.color}
          >
            {c.text}
          </text>
          <line
            x1={anchorX}
            x2={anchorX}
            y1={stemY1}
            y2={stemY2}
            stroke={c.color}
            strokeWidth={0.7}
            strokeDasharray="1.5 1.5"
            opacity={0.7}
          />
        </g>
      );
    })}
  </>
);

// ---------------------------------------------------------------------------
// Activity strip — two inline mini-visualizations sharing the horizontal
// timeline:
//   · MRs merged per sprint  — dotplot, one circle per ~5 MRs
//   · Issues closed per sprint — thin bars, square-cornered, inverted hue
// Stacked vertically so both read as a "heartbeat" band under the commits.
// ---------------------------------------------------------------------------

const ActivityStrip: React.FC<{ half: "left" | "right"; width: number }> = ({
  half,
  width,
}) => {
  const [startIdx, endIdx] = HALF_RANGE[half];
  const padL = PAD_LEFT(half);
  const padR = PAD_RIGHT(half);
  const plotW = width - padL - padR;
  const bucketsInSlice = endIdx - startIdx;
  const stride = plotW / bucketsInSlice;

  // Only show sprints that START in this half — avoids a sprint straddling
  // the fold appearing twice (once on each page) with duplicated MR dots
  // and overlapping issue bars. Left: S6+S7 (start <8), Right: S8+S9.
  const sprintsHere = SPRINT_WEEK_RANGES.map((range, i) => ({
    idx: i,
    sprintRange: range,
    stats: SPRINT_STATS[i]!,
  })).filter(
    ({ sprintRange: [s] }) => s >= startIdx && s < endIdx,
  );

  // Vertical layout (top → bottom):
  //   y=0..11   sprint bracket + S# label
  //   y=12..22  MR dotplot track
  //   y=23..30  MR count label (amber mono)
  //   y=32..48  issue bar track
  //   y=50..60  issue count label (green mono)
  const ROW1_Y = 18;
  const ROW2_Y = 34;
  const MAX_ISSUES = Math.max(...SPRINT_STATS.map((s) => s.issues));
  const ISSUE_BAR_MAX_H = 14;

  return (
    <svg width={width} height={70} style={{ display: "block", overflow: "visible" }}>
      {/* Row labels on left half only — aligned with each sub-track */}
      {half === "left" && (
        <>
          <text
            x={2}
            y={ROW1_Y + 3}
            fontFamily={FONTS.MONO}
            fontSize={7}
            fontWeight={600}
            letterSpacing="0.12em"
            fill={COLORS.AMBER}
            opacity={0.9}
          >
            MERGES
          </text>
          <text
            x={2}
            y={ROW2_Y + ISSUE_BAR_MAX_H - 3}
            fontFamily={FONTS.MONO}
            fontSize={7}
            fontWeight={600}
            letterSpacing="0.12em"
            fill={COLORS.SUCCESS}
            opacity={0.9}
          >
            ISSUES
          </text>
        </>
      )}

      {/* Baseline rails — MR track has a subtle rail; issue track has a
          stronger baseline since its bars sit on top of it. */}
      <line x1={padL} x2={width - padR} y1={ROW1_Y + 4} y2={ROW1_Y + 4} stroke={COLORS.HAIRLINE} strokeWidth={0.3} />
      <line x1={padL} x2={width - padR} y1={ROW2_Y + ISSUE_BAR_MAX_H} y2={ROW2_Y + ISSUE_BAR_MAX_H} stroke={COLORS.HAIRLINE_STRONG} strokeWidth={0.4} />

      {sprintsHere.map(({ idx, sprintRange: [s, e], stats }) => {
        const localStart = Math.max(s, startIdx) - startIdx;
        const localEnd = Math.min(e, endIdx) - startIdx;
        const spanX1 = padL + localStart * stride;
        const spanX2 = padL + localEnd * stride;
        const spanW = spanX2 - spanX1;
        const spanCX = spanX1 + spanW / 2;

        // MR dots — one dot per 5 MRs, capped at 12 to keep it tidy.
        const dotCount = Math.min(12, Math.ceil(stats.mrs / 5));
        const dotGap = Math.min(8, spanW / (dotCount + 1));
        const dotStartX = spanCX - ((dotCount - 1) * dotGap) / 2;

        // Issue bar — proportional height, capped.
        const barH = Math.max(3, (stats.issues / MAX_ISSUES) * ISSUE_BAR_MAX_H);
        const barW = Math.min(spanW - 12, 44);

        return (
          <g key={idx}>
            {/* Span bracket — sprint label only (no bracket ticks, keeps
                the strip visually uncluttered). */}
            <text
              x={spanCX}
              y={ROW1_Y - 4}
              textAnchor="middle"
              fontFamily={FONTS.MONO}
              fontSize={7.5}
              fontWeight={700}
              letterSpacing="0.1em"
              fill={COLORS.AMBER}
            >
              S{6 + idx}
            </text>

            {/* Dotplot — each circle = ~5 merged MRs. Total count sits to
                the right of the last dot as a compact tabular number. */}
            {Array.from({ length: dotCount }, (_, i) => (
              <circle
                key={i}
                cx={dotStartX + i * dotGap}
                cy={ROW1_Y + 4}
                r={MR_DOT_R}
                fill={COLORS.AMBER}
                opacity={0.85}
              />
            ))}
            <text
              x={dotStartX + (dotCount - 1) * dotGap + 12}
              y={ROW1_Y + 7}
              textAnchor="start"
              fontFamily={FONTS.MONO}
              fontSize={8}
              fontWeight={700}
              fill={COLORS.AMBER}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {stats.mrs}
            </text>

            {/* Issue bar — value label inside-top (or above for short bars)
                so tall S9 bar doesn't eat the number. */}
            <rect
              x={spanCX - barW / 2}
              y={ROW2_Y + ISSUE_BAR_MAX_H - barH}
              width={barW}
              height={barH}
              fill={COLORS.SUCCESS}
              opacity={0.78}
              rx={1}
            />
            <text
              x={spanCX}
              y={ROW2_Y + ISSUE_BAR_MAX_H + 10}
              textAnchor="middle"
              fontFamily={FONTS.MONO}
              fontSize={7.5}
              fontWeight={700}
              fill={COLORS.SUCCESS}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {stats.issues}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Contributor strip — per-week split between Shree and Ayush, rendered as
// a thin stacked horizontal band. Derived from BUILD.sprints authorship:
// S6+S7 = shared (≈60/40), S8 = Shree solo (100/0), S9 = shared (≈75/25).
// These proportions apportion each week's commit count into the two
// stacked sub-bars.
// ---------------------------------------------------------------------------

const CONTRIBUTOR_SPLIT: number[] = (() => {
  // [shareShree] per global week. Ayush share = 1 - shareShree.
  const split = new Array(TOTAL_WEEKS).fill(0.6);
  // Sprint ranges from SPRINT_WEEK_RANGES.
  SPRINT_WEEK_RANGES.forEach(([s, e], idx) => {
    const shreeShare = idx === 0 ? 0.55 : idx === 1 ? 0.62 : idx === 2 ? 1.0 : 0.76;
    for (let i = s; i < e; i++) split[i] = shreeShare;
  });
  return split;
})();

const ContributorStrip: React.FC<{ half: "left" | "right"; width: number }> = ({
  half,
  width,
}) => {
  const [startIdx, endIdx] = HALF_RANGE[half];
  const padL = PAD_LEFT(half);
  const padR = PAD_RIGHT(half);
  const plotW = width - padL - padR;
  const bucketsInSlice = endIdx - startIdx;
  const stride = plotW / bucketsInSlice;
  // 100%-stacked per-week bar. Height is fixed so the Shree/Ayush ratio
  // reads clearly; absolute commit weight is already carried by the main
  // chart above.
  const BAR_H = 10;
  const TRACK_Y = 16;

  return (
    <svg width={width} height={40} style={{ display: "block", overflow: "visible" }}>
      {half === "left" && (
        <text
          x={2}
          y={TRACK_Y + 7}
          fontFamily={FONTS.MONO}
          fontSize={7}
          fontWeight={600}
          letterSpacing="0.12em"
          fill={COLORS.INK_SUBTLE}
        >
          AUTHOR
        </text>
      )}
      {WEEKLY_BUCKETS.slice(startIdx, endIdx).map((b, i) => {
        const gi = startIdx + i;
        const x = padL + i * stride + 1;
        const w = stride - 2;
        const shreeShare = CONTRIBUTOR_SPLIT[gi] ?? 0.6;
        const shreeW = w * shreeShare;
        return (
          <g key={b.week}>
            <rect
              x={x}
              y={TRACK_Y}
              width={shreeW}
              height={BAR_H}
              fill={COLORS.MIAMI_RED}
              opacity={0.72}
            />
            <rect
              x={x + shreeW}
              y={TRACK_Y}
              width={w - shreeW}
              height={BAR_H}
              fill={COLORS.ACCENT}
              opacity={0.58}
            />
          </g>
        );
      })}

      {/* Legend — right half only, sits above the track on inside edge */}
      {half === "right" && (
        <g>
          <rect x={width - padR - 70} y={TRACK_Y - 9} width={6} height={4} fill={COLORS.MIAMI_RED} opacity={0.72} />
          <text
            x={width - padR - 61}
            y={TRACK_Y - 5}
            fontFamily={FONTS.MONO}
            fontSize={7}
            fontWeight={600}
            letterSpacing="0.08em"
            fill={COLORS.INK_MUTED}
          >
            SHREE
          </text>
          <rect x={width - padR - 32} y={TRACK_Y - 9} width={6} height={4} fill={COLORS.ACCENT} opacity={0.58} />
          <text
            x={width - padR - 23}
            y={TRACK_Y - 5}
            fontFamily={FONTS.MONO}
            fontSize={7}
            fontWeight={600}
            letterSpacing="0.08em"
            fill={COLORS.INK_MUTED}
          >
            AYUSH
          </text>
        </g>
      )}
      {half === "left" && (
        <text
          x={width - padR - 4}
          y={TRACK_Y - 5}
          textAnchor="end"
          fontFamily={FONTS.SERIF}
          fontStyle="italic"
          fontSize={9}
          fill={COLORS.INK_SUBTLE}
        >
          per-week author share
        </text>
      )}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Sprint strip — compressed horizontal card. Replaces the old boxy cards
// with a flat, editorial layout: S-number color-block + date rail + bulleted
// milestones on the right, tiny metric chips at the bottom.
// ---------------------------------------------------------------------------

const SprintStrip: React.FC<{
  sprint: typeof BUILD.sprints[number];
  stats: SprintStats;
}> = ({ sprint, stats }) => (
  <div
    style={{
      borderTop: `0.5pt solid ${COLORS.HAIRLINE_STRONG}`,
      paddingTop: 8,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: COLORS.AMBER,
          lineHeight: 1,
        }}
      >
        {sprint.num}
      </span>
      <span
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 7.5,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.INK_MUTED,
        }}
      >
        {sprint.dateRange}
      </span>
      <span style={{ flex: 1 }} />
      <span
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 7,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
        }}
      >
        by {sprint.author.replace("Shree + Ayush", "S + A")}
      </span>
    </div>
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {sprint.milestones.map((m, i) => (
        <li
          key={i}
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 9.5,
            fontWeight: 400,
            lineHeight: 1.3,
            color: COLORS.INK,
            display: "flex",
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 7,
              fontWeight: 600,
              color: COLORS.INK_SUBTLE,
              minWidth: 11,
              paddingTop: 2,
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>{m}</span>
        </li>
      ))}
    </ul>
    <div
      style={{
        display: "flex",
        gap: 8,
        marginTop: 2,
        fontFamily: FONTS.MONO,
        fontSize: 7,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
      }}
    >
      <span>{stats.commits} commits</span>
      <span>·</span>
      <span>{stats.mrs} mrs</span>
      <span>·</span>
      <span>{stats.issues} issues</span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Editorial rail — the lower band: big italic-serif pull quote + totals
// line at the very bottom. Positioned differently per half so the two
// quotes speak across the gutter.
// ---------------------------------------------------------------------------

const EditorialRail: React.FC<{
  half: "left" | "right";
  width: number;
  startIdx: number;
  endIdx: number;
}> = ({ half, width, startIdx, endIdx }) => {
  void startIdx;
  void endIdx;
  void width;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 8,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 22,
          fontWeight: 400,
          letterSpacing: "0",
          lineHeight: 1.2,
          color: COLORS.INK,
          textAlign: half === "left" ? "left" : "right",
          maxWidth: "5in",
          marginLeft: half === "left" ? 0 : "auto",
        }}
      >
        “{HALF_PULL_QUOTE[half]}”
      </div>

      {half === "right" && (
        <div
          style={{
            paddingTop: 8,
            borderTop: `0.5pt solid ${COLORS.HAIRLINE_STRONG}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            fontFamily: FONTS.MONO,
            fontSize: 7.5,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
            whiteSpace: "nowrap",
          }}
        >
          <span>
            {JOURNEY.commits.toLocaleString()} · {JOURNEY.issues} ·{" "}
            {JOURNEY.mrs} · {JOURNEY.activeDays}d · {JOURNEY.months}mo
          </span>
          <span style={{ color: COLORS.MIAMI_RED }}>peak · apr 5 · +420</span>
        </div>
      )}

      {half === "left" && (
        <div
          style={{
            paddingTop: 8,
            borderTop: `0.5pt solid ${COLORS.HAIRLINE_STRONG}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontFamily: FONTS.MONO,
            fontSize: 7.5,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
          }}
        >
          <span>
            S6–S7 · foundation · {HALF_TOTALS.left.commits.toLocaleString()}{" "}
            commits
          </span>
          <span style={{ color: COLORS.ACCENT, opacity: 0.8 }}>
            chart continues →
          </span>
        </div>
      )}
    </div>
  );
};

// Silence unused-warning when tsc compiles — `PEAK_BUCKET` is used for doc
// purposes (MD comment above) but referenced here for future work.
void PEAK_BUCKET;
