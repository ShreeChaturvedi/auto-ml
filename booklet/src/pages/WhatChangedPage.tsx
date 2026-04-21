import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { WHY } from "../content";
import { ApprovalGateCallout } from "../primitives/ApprovalGateCallout";
import { FortyFiveAngle } from "../primitives/FortyFiveAngle";

/** Page 07 — "What Changed". 2-column Before / With AAMT comparison. */
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
    headline="Notebook-as-ritual → agent-as-colleague."
  >
    {/* 45° rule at the seam between the two columns */}
    <FortyFiveAngle length={120} top={140} left={310} color={COLORS.INK} />

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
        <ul style={{ ...listStyle, gap: 14 }}>
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
    <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
      <ApprovalGateCallout width="5.2in">
        {WHY.whatChanged.approvalGate}
      </ApprovalGateCallout>
    </div>
  </BodyPage>
);

const ColumnEyebrow: React.FC<{ label: string; color: string }> = ({
  label,
  color,
}) => (
  <div
    style={{
      fontFamily: FONTS.MONO,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color,
      marginBottom: 10,
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
  gap: 10,
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
