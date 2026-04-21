import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { WHY } from "../content";
import { ApprovalGateCallout } from "../primitives/ApprovalGateCallout";
import { Eyebrow } from "../primitives/Eyebrow";

/** Page 07 — "What Changed". 2-column Before / With AAMT comparison, a
 *  philosophical gate callout, and a closing "failure modes that disappeared"
 *  ledger that turns the abstract comparison into diagnostic specifics. */
export const WhatChangedPage: React.FC<{
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
    eyebrow="§01 · WHAT CHANGED"
    headline="From ritual to colleague."
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 24,
        marginTop: 10,
      }}
    >
      {/* Left — dense */}
      <div>
        <ColumnEyebrow label={WHY.whatChanged.beforeTitle} color={COLORS.INK_MUTED} />
        <ul style={listStyle}>
          {WHY.whatChanged.before.map((item, i) => (
            <li key={i} style={{ ...itemStyle, fontWeight: 500 }}>
              <span style={numStyle}>{String(i + 1).padStart(2, "0")}</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Right — generous */}
      <div>
        <ColumnEyebrow label={WHY.whatChanged.withTitle} color={SECTION["01_WHY"]} />
        <ul style={{ ...listStyle, gap: 12 }}>
          {WHY.whatChanged.with.map((item, i) => (
            <li key={i} style={{ ...itemStyle, fontWeight: 500 }}>
              <span style={{ ...numStyle, color: SECTION["01_WHY"] }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>

    {/* Approval-gate callout — first of the ≤4 budgeted instances */}
    <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
      <ApprovalGateCallout width="5.2in">
        {WHY.whatChanged.approvalGate}
      </ApprovalGateCallout>
    </div>

    {/* Failure-modes ledger — gives the before/after comparison a
        diagnostic register. Each row names a silent killer of manual
        notebooks and the structural reason it can't happen here. */}
    <FailureModesLedger />
  </BodyPage>
);

const FailureModesLedger: React.FC = () => {
  const { eyebrow, lede, rows } = WHY.whatChanged.failureModes;
  const GRID = "26px 1.35fr 1.7fr";
  return (
    <section style={{ marginTop: 22 }}>
      {/* Chapter-style section rule + italic lede */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          borderTop: `1pt solid ${COLORS.INK}`,
          paddingTop: 8,
          marginBottom: 10,
        }}
      >
        <Eyebrow color={COLORS.INK}>{eyebrow}</Eyebrow>
        <span
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 12,
            lineHeight: 1.35,
            color: COLORS.INK_MUTED,
            flex: 1,
          }}
        >
          {lede}
        </span>
      </div>

      {/* Column headers — set expectation once, then let rows breathe */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          columnGap: 14,
          paddingBottom: 4,
          marginBottom: 4,
          borderBottom: `0.4pt solid ${COLORS.HAIRLINE}`,
        }}
      >
        <span />
        <Eyebrow color={COLORS.INK_MUTED}>FAILURE · MANUAL NOTEBOOK</Eyebrow>
        <div style={{ paddingLeft: 10 }}>
          <Eyebrow color={SECTION["01_WHY"]}>STRUCTURAL FIX · AAMT</Eyebrow>
        </div>
      </div>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {rows.map((row, i) => (
          <li
            key={row.id}
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              columnGap: 14,
              padding: "9px 0 10px",
              borderTop: i === 0 ? "none" : `0.4pt solid ${COLORS.HAIRLINE}`,
              alignItems: "start",
            }}
          >
            <span
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 10,
                fontWeight: 700,
                color: COLORS.INK_MUTED,
                letterSpacing: "0.08em",
                paddingTop: 2,
              }}
            >
              {row.id}
            </span>

            <div>
              <div
                style={{
                  fontFamily: FONTS.SANS,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  color: COLORS.INK,
                  marginBottom: 3,
                }}
              >
                {row.failure}
              </div>
              <div
                style={{
                  fontFamily: FONTS.SERIF,
                  fontStyle: "italic",
                  fontSize: 10.5,
                  lineHeight: 1.4,
                  color: COLORS.INK_MUTED,
                }}
              >
                {row.oldSymptom}
              </div>
            </div>

            <div
              style={{
                borderLeft: `1.5pt solid ${SECTION["01_WHY"]}`,
                paddingLeft: 10,
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.SANS,
                  fontSize: TYPE.body.size,
                  letterSpacing: TYPE.body.tracking,
                  lineHeight: 1.4,
                  color: COLORS.INK,
                }}
              >
                {row.newSafeguard}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

const ColumnEyebrow: React.FC<{ label: string; color: string }> = ({
  label,
  color,
}) => (
  <div
    style={{
      fontFamily: FONTS.MONO,
      fontSize: TYPE.eyebrow.size,
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color,
      marginBottom: 8,
      paddingBottom: 4,
      borderBottom: `1pt solid ${color}`,
    }}
  >
    {label}
  </div>
);

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const itemStyle: React.CSSProperties = {
  fontFamily: FONTS.SANS,
  fontSize: TYPE.body.size,
  letterSpacing: TYPE.body.tracking,
  lineHeight: TYPE.body.lh,
  color: COLORS.INK,
  display: "grid",
  gridTemplateColumns: "22px 1fr",
  columnGap: 6,
};

const numStyle: React.CSSProperties = {
  fontFamily: FONTS.MONO,
  fontSize: 9,
  fontWeight: 700,
  color: COLORS.INK_MUTED,
  letterSpacing: "0.08em",
  paddingTop: 2,
};
