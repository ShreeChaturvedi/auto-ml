import React from "react";
import { Page } from "../primitives/Page";
import { Eyebrow } from "../primitives/Eyebrow";
import { SprintTimeline } from "../diagrams/SprintTimeline";
import { COLORS, FONTS } from "../theme";

/**
 * Spread template — pages 24/25. Each half renders one SprintTimeline with
 * the shared geometry contract, so the two adjacent pages align across the
 * gutter into a single continuous infographic.
 *
 * Editorial framing around the chart:
 *   · Eyebrow (mono UPPERCASE, red accent) — identifies the spread + half
 *   · Headline (serif italic, left half only) — book's single "build" h1
 *   · Subhead (sans, both halves) — one line each, balanced across the fold
 *   · SprintTimeline — the continuous chart + activity strip + sprint cards
 */
export type SpreadPageProps = {
  half: "left" | "right";
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
  sectionLabel: string;
  sectionColor: string;
};

const SPREAD_W = 520;
const SPREAD_H = 720;

export const SpreadPage: React.FC<SpreadPageProps> = ({
  half,
  parity,
  pageNumber,
  totalPages,
  sectionLabel,
  sectionColor,
}) => (
  <Page
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel={sectionLabel}
    sectionColor={sectionColor}
  >
    <Eyebrow color={sectionColor} style={{ marginBottom: 4 }}>
      §05 · BUILD · THE TIMELINE {half === "left" ? "· LEFT" : "· RIGHT"}
    </Eyebrow>

    {half === "left" ? (
      <div style={{ marginBottom: 4 }}>
        <h1
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            color: COLORS.INK,
            margin: 0,
          }}
        >
          Eleven months, one curve.
        </h1>
        <p
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 13,
            lineHeight: 1.35,
            color: COLORS.INK_MUTED,
            margin: "3px 0 0",
            maxWidth: "5.5in",
          }}
        >
          Weekly commits with the cumulative line overlaid · read the chart
          across the gutter.
        </p>
      </div>
    ) : (
      <div style={{ marginBottom: 4, textAlign: "right" }}>
        <h1
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            color: COLORS.INK,
            margin: 0,
          }}
        >
          The push to the leaderboard.
        </h1>
        <p
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 13,
            lineHeight: 1.35,
            color: COLORS.INK_MUTED,
            margin: "3px 0 0 auto",
            maxWidth: "5.5in",
          }}
        >
          Solo rebuild in S8, 420-commit peak the week before expo, final
          push across the Kaggle leaderboard.
        </p>
      </div>
    )}

    <div style={{ height: 8 }} />
    <SprintTimelineWrapper half={half} />
  </Page>
);

const SprintTimelineWrapper: React.FC<{ half: "left" | "right" }> = ({
  half,
}) => (
  <div
    style={{
      width: SPREAD_W,
      height: SPREAD_H,
      marginTop: 4,
      background: COLORS.PAPER,
    }}
  >
    <SprintTimeline half={half} width={SPREAD_W} height={SPREAD_H} />
  </div>
);
