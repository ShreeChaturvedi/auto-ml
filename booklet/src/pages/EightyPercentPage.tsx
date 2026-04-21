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
}> = ({ parity, pageNumber, totalPages }) => (
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
      {WHY.eightyPercent.pullQuote}
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
      {WHY.eightyPercent.body.slice(0, 2).map((p, i) => (
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

    <p
      style={{
        fontFamily: FONTS.SANS,
        fontSize: TYPE.body.size,
        fontWeight: TYPE.body.weight,
        letterSpacing: TYPE.body.tracking,
        lineHeight: TYPE.body.lh,
        color: COLORS.INK,
        marginTop: 10,
        maxWidth: "6.4in",
      }}
    >
      {WHY.eightyPercent.body[2]}
    </p>

    <div
      style={{
        marginTop: 16,
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 500,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: COLORS.INK_SUBTLE,
      }}
    >
      source · Anaconda State of Data Science 2022 · n = 3,493
    </div>
  </BodyPage>
);
