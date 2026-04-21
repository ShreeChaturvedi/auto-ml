import React from "react";
import { COLORS, FONTS } from "../theme";
import { BUILD, JOURNEY, WEEKLY_BUCKETS, MONTH_TICKS } from "../content";
import { CommitBarRow } from "../visuals/CommitBarRow";

/**
 * 2-page horizontal sprint timeline — pages 24/25.
 *
 * Half 1 (page 24) covers sprints S6 + S7 (weekly buckets 0..7 inclusive).
 * Half 2 (page 25) covers sprints S8 + S9 (weekly buckets 8..16 inclusive).
 * Both halves share the same Y-axis scale and month-tick rhythm so the
 * reader perceives one continuous chart across the gutter.
 */

export type SprintTimelineProps = {
  half: "left" | "right";
  width: number;
  height: number;
};

const HALF_RANGE: Record<"left" | "right", [number, number]> = {
  left: [0, 8],
  right: [8, WEEKLY_BUCKETS.length],
};

const HALF_SPRINTS: Record<"left" | "right", Array<typeof BUILD.sprints[number]>> = {
  left:  [BUILD.sprints[0]!, BUILD.sprints[1]!],
  right: [BUILD.sprints[2]!, BUILD.sprints[3]!],
};

const HALF_PULL_QUOTE: Record<"left" | "right", string> = {
  left: BUILD.pullQuotes.left,
  right: BUILD.pullQuotes.right,
};

export const SprintTimeline: React.FC<SprintTimelineProps> = ({
  half,
  width,
  height,
}) => {
  const sprints = HALF_SPRINTS[half];
  const [startIdx, endIdx] = HALF_RANGE[half];

  // Chart fills the upper 55%; sprint cards fill the lower 45%.
  const chartH = Math.round(height * 0.55);
  const cardsTop = chartH + 16;
  const cardsH = height - cardsTop;

  return (
    <div style={{ position: "relative", width, height, fontFamily: FONTS.SANS }}>
      {/* Header strip — month markers + sprint ID badges */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: COLORS.INK_MUTED,
        }}
      >
        <span>
          {half === "left" ? "01" : "02"} / 02 · sprints{" "}
          {sprints.map((s) => s.num).join(" + ")}
        </span>
        <span>
          weeks {startIdx + 1}–{endIdx} of {WEEKLY_BUCKETS.length}
        </span>
      </div>

      {/* Chart slice — uses the booklet's CommitBarRow with a range window */}
      <div style={{ position: "absolute", top: 30, left: 0, width, height: chartH - 30 }}>
        <CommitBarRow
          width={width}
          height={chartH - 30}
          range={[startIdx, endIdx]}
          hidePeak={half === "left"}
        />
      </div>

      {/* Sprint cards — 2 per half, stacked vertically */}
      <div
        style={{
          position: "absolute",
          top: cardsTop,
          left: 0,
          right: 0,
          height: cardsH,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
        }}
      >
        {sprints.map((sprint) => (
          <SprintCard key={sprint.num} sprint={sprint} />
        ))}
      </div>

      {/* Pull quote — bottom band, Instrument Serif italic */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 16,
          lineHeight: 1.25,
          color: COLORS.INK,
          textAlign: half === "left" ? "left" : "right",
        }}
      >
        “{HALF_PULL_QUOTE[half]}”
      </div>

      {/* Monthly ticks — visually ties both halves to the same calendar */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 0,
          right: 0,
          fontFamily: FONTS.MONO,
          fontSize: 7,
          fontWeight: 500,
          color: COLORS.INK_SUBTLE,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{monthLabelAt(startIdx)}</span>
        <span>{monthLabelAt(endIdx - 1)}</span>
      </div>

      {/* Totals strip (only right half gets the JOURNEY totals line) */}
      {half === "right" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 42,
            fontFamily: FONTS.MONO,
            fontSize: 8,
            fontWeight: 600,
            color: COLORS.INK_MUTED,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {JOURNEY.totalsLine}
        </div>
      )}
    </div>
  );
};

function monthLabelAt(weekIdx: number): string {
  const m = [...MONTH_TICKS].reverse().find((tick) => tick.atWeek <= weekIdx);
  return m?.label ?? "";
}

const SprintCard: React.FC<{ sprint: typeof BUILD.sprints[number] }> = ({
  sprint,
}) => (
  <div
    style={{
      border: `0.75pt solid ${COLORS.HAIRLINE}`,
      borderRadius: 6,
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      background: COLORS.PAPER,
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: COLORS.AMBER,
        }}
      >
        {sprint.num}
      </span>
      <span
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: COLORS.INK_MUTED,
        }}
      >
        {sprint.dateRange}
      </span>
    </div>
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      {sprint.milestones.map((m, i) => (
        <li
          key={i}
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 10,
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
              fontSize: 8,
              fontWeight: 600,
              color: COLORS.INK_MUTED,
              minWidth: 14,
              paddingTop: 1,
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
        marginTop: 2,
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: COLORS.INK_SUBTLE,
      }}
    >
      by {sprint.author}
    </div>
  </div>
);
