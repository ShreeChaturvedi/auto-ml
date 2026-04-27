import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { WHY } from "../content";
import { PullQuote } from "../primitives/PullQuote";
import { ActivityLedgerChart } from "../visuals/ActivityLedgerChart";

/** Page 05 — "The 80% Problem". */
export const EightyPercentPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => {
  const { eightyPercent } = WHY;
  const cliff = eightyPercent.secondCliff;
  return (
    <BodyPage
      parity={parity}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionLabel="WHY"
      sectionColor={SECTION["01_WHY"]}
      eyebrow="§01 · WHY"
      headline="The 80% Problem."
    >
      <PullQuote size="default" style={{ maxWidth: "6in", marginBottom: 20 }}>
        {eightyPercent.pullQuote}
      </PullQuote>

      {/* Activity ledger — scaled to fit a 5.5" content width */}
      <div style={{ margin: "8px 0 18px" }}>
        <ActivityLedgerChart
          labelWidth={120}
          trackWidth={300}
          rowHeight={22}
          fontSize={11}
          pctFontSize={12}
          barHeight={8}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 20,
        }}
      >
        {eightyPercent.body.map((p, i) => (
          <p
            key={i}
            style={{
              fontFamily: FONTS.SANS,
              fontSize: TYPE.body.size,
              fontWeight: TYPE.body.weight,
              letterSpacing: TYPE.body.tracking,
              lineHeight: TYPE.body.lh,
              color: COLORS.INK,
              margin: 0,
            }}
          >
            {p}
          </p>
        ))}
      </div>

      <div
        style={{
          marginTop: 14,
          fontFamily: FONTS.MONO,
          fontSize: TYPE.eyebrow.size,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
        }}
      >
        source · Anaconda State of Data Science 2022 · n = 3,493
      </div>

      {/* Serif coda — sits lower on the page, pulling focus down toward the
          second-cliff insight. Normal weight Instrument Serif, not italic. */}
      <p
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "normal",
          fontSize: 15,
          fontWeight: 400,
          lineHeight: 1.4,
          color: COLORS.INK,
          maxWidth: "5.5in",
          margin: "40px 0 0",
        }}
      >
        {eightyPercent.coda}
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Second-cliff insight — 87% of data science projects never reach     */}
      {/* production. Rendered as a hero-number block + three-stop pipeline   */}
      {/* chart. One insight, one visual; no wall of text.                    */}
      {/* ------------------------------------------------------------------ */}
      <SecondCliff data={cliff} />
    </BodyPage>
  );
};

// ---------------------------------------------------------------------------
// Second cliff — hero number paired with a 100-bar that shows the two
// attrition fenceposts. Deliberately minimal: the figure reads at 2ft, the
// bar reads at reading distance.
// ---------------------------------------------------------------------------

const SecondCliff: React.FC<{
  data: typeof WHY.eightyPercent.secondCliff;
}> = ({ data }) => (
  <div
    style={{
      marginTop: 22,
      paddingTop: 18,
      borderTop: `1px solid ${COLORS.HAIRLINE}`,
      display: "grid",
      gridTemplateColumns: "1.3fr 1.7fr",
      columnGap: 28,
      alignItems: "start",
    }}
  >
    <div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: TYPE.eyebrow.size,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.MIAMI_RED,
          marginBottom: 6,
        }}
      >
        the second cliff
      </div>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 84,
          fontWeight: 700,
          letterSpacing: "-0.035em",
          lineHeight: 0.95,
          color: COLORS.MIAMI_RED,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {data.figure}
      </div>
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 17,
          fontWeight: 400,
          lineHeight: 1.28,
          color: COLORS.INK,
          marginTop: 8,
          maxWidth: "2.6in",
        }}
      >
        {data.label}
      </div>
    </div>

    <div>
      <PipelineBar stops={data.pipeline} />
      <p
        style={{
          fontFamily: FONTS.SANS,
          fontSize: TYPE.body.size,
          fontWeight: TYPE.body.weight,
          letterSpacing: TYPE.body.tracking,
          lineHeight: TYPE.body.lh,
          color: COLORS.INK,
          margin: "14px 0 0",
        }}
      >
        {data.copy}
      </p>
      <div
        style={{
          marginTop: 10,
          fontFamily: FONTS.MONO,
          fontSize: TYPE.eyebrow.size,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
        }}
      >
        {data.source}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// PipelineBar — three horizontal bars stacked on one common 0-100 scale.
// Each row is two lines: [stage — count of 100] above a bar, with a muted
// caption below. The two attrition cliffs (−80% prep, −87% deploy) read
// as shrinking bars; annotations sit in their own line so nothing collides.
// ---------------------------------------------------------------------------

const PipelineBar: React.FC<{
  stops: typeof WHY.eightyPercent.secondCliff.pipeline;
}> = ({ stops }) => {
  const trackW = 360; // px — full width; no crowded right gutter
  const barH = 10;

  return (
    <div>
      {stops.map((s, i) => {
        const isLast = i === stops.length - 1;
        const fill = isLast
          ? COLORS.MIAMI_RED
          : i === 0
          ? COLORS.INK
          : COLORS.NEUTRAL_600;
        const barW = (s.n / 100) * trackW;
        const accent = isLast ? COLORS.MIAMI_RED : COLORS.INK;
        return (
          <div
            key={s.stage}
            style={{
              marginTop: i === 0 ? 0 : 12,
              width: trackW,
            }}
          >
            {/* Header row: stage on left, count on right (above the bar) */}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.SANS,
                  fontSize: 11,
                  fontWeight: isLast ? 700 : 600,
                  color: accent,
                  letterSpacing: "-0.005em",
                }}
              >
                {s.stage}
              </div>
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 12,
                  fontWeight: isLast ? 700 : 500,
                  fontVariantNumeric: "tabular-nums",
                  color: accent,
                }}
              >
                {s.n}
                <span
                  style={{
                    marginLeft: 4,
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    color: COLORS.INK_SUBTLE,
                    textTransform: "uppercase",
                  }}
                >
                  / 100
                </span>
              </div>
            </div>
            {/* The bar itself, on its own row */}
            <div
              style={{
                width: trackW,
                height: barH,
                background: COLORS.SURFACE,
                borderRadius: barH / 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: barW,
                  height: "100%",
                  background: fill,
                  borderRadius: barH / 2,
                }}
              />
            </div>
            {/* Caption row: attrition note, its own line, nothing to collide */}
            <div
              style={{
                marginTop: 3,
                fontFamily: FONTS.SANS,
                fontSize: 9.5,
                lineHeight: 1.2,
                color: COLORS.INK_MUTED,
                letterSpacing: "0.005em",
              }}
            >
              {s.note}
            </div>
          </div>
        );
      })}
    </div>
  );
};
