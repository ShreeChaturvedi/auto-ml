import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { HOW } from "../content";
import { Eyebrow } from "../primitives/Eyebrow";

/** Page 09 — "Three Pillars" (CHAT / PLAN / NOTEBOOK). */
export const ThreePillarsPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <BodyPage
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="HOW"
    sectionColor={SECTION["02_HOW"]}
    eyebrow="§02 · HOW · THREE PILLARS"
    headline="Three ways to work the notebook."
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        columnGap: 20,
        marginTop: 18,
      }}
    >
      {HOW.threePillars.map((pillar) => (
        <PillarColumn key={pillar.eyebrow} pillar={pillar} />
      ))}
    </div>

    <PhaseLoopDiagram />

    <LoopInMotion />
  </BodyPage>
);

const PillarColumn: React.FC<{
  pillar: (typeof HOW.threePillars)[number];
}> = ({ pillar }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <Eyebrow color={SECTION["02_HOW"]} size="small">
      {pillar.eyebrow}
    </Eyebrow>
    <h2
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 22,
        fontWeight: 400,
        lineHeight: 1.18,
        color: COLORS.INK,
        margin: 0,
      }}
    >
      {pillar.headline}
    </h2>
    <p
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
      {pillar.body}
    </p>
    <div
      style={{
        marginTop: "auto",
        paddingTop: 10,
        fontFamily: FONTS.MONO,
        fontSize: 10,
        fontWeight: 600,
        color: SECTION["02_HOW"],
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      → {pillar.outcome}
    </div>
  </div>
);

/** 6-phase loop ring at the bottom of the page. Enlarged per typography pass. */
const PhaseLoopDiagram: React.FC = () => {
  const phases = HOW.phases;
  const cx = 300;
  const cy = 128;
  const r = 82;
  const labelOffset = 30;
  // Short labels keep the ring legible at the enlarged radius.
  const shortNames = ["Upload", "Explore", "Preprocess", "Features", "Train", "Experiments"];
  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 10,
        borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
      }}
    >
      <Eyebrow color={COLORS.INK_MUTED} style={{ marginBottom: 6 }}>
        THE 6-PHASE LOOP
      </Eyebrow>
      <svg width={600} height={250} viewBox={`0 0 600 250`} style={{ display: "block", margin: "0 auto" }}>
        {/* ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={COLORS.HAIRLINE_STRONG}
          strokeWidth={0.75}
          strokeDasharray="2 3"
        />
        {phases.map((phase, i) => {
          const a = (i / phases.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          return (
            <g key={phase.num}>
              <circle
                cx={x}
                cy={y}
                r={13}
                fill={SECTION["02_HOW"]}
                stroke={COLORS.PAPER}
                strokeWidth={1.75}
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontFamily={FONTS.MONO}
                fontSize={10}
                fontWeight={700}
                fill={COLORS.PAPER}
                style={{ letterSpacing: "0.02em" }}
              >
                {phase.num}
              </text>
              {/* radial label, offset outward */}
              <text
                x={cx + Math.cos(a) * (r + labelOffset)}
                y={cy + Math.sin(a) * (r + labelOffset) + 4}
                textAnchor="middle"
                fontFamily={FONTS.SANS}
                fontSize={11}
                fontWeight={600}
                fill={COLORS.INK_MUTED}
                style={{ letterSpacing: "-0.005em" }}
              >
                {shortNames[i]}
              </text>
            </g>
          );
        })}
        {/* label at center */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontFamily={FONTS.SERIF}
          fontStyle="italic"
          fontSize={18}
          fill={COLORS.INK_MUTED}
        >
          upload
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontFamily={FONTS.SERIF}
          fontStyle="italic"
          fontSize={18}
          fill={COLORS.INK_MUTED}
        >
          to ship.
        </text>
      </svg>
    </div>
  );
};

/**
 * Lower-half editorial: the 6-phase loop unrolled, with the user/agent split
 * the three pillars promise. Each row pairs a human action ("you do X") with
 * the agent action ("agent does Y") and a quantitative footnote — so the
 * collaboration contract is legible at a glance.
 */
const LOOP_ROWS: {
  num: string;
  name: string;
  you: string;
  agent: string;
  metric: string;
}[] = [
  {
    num: "01",
    name: "Upload",
    you: "Drop a CSV, name the project.",
    agent: "Profiles 20 rows, infers 6 dtypes, primes schema cache.",
    metric: "≤ 5s profile",
  },
  {
    num: "02",
    name: "Explore",
    you: "Ask in English — “rows where age > 60”.",
    agent: "Compiles to read-only SELECT; caches on AST hash.",
    metric: "40ms p50",
  },
  {
    num: "03",
    name: "Preprocess",
    you: "Approve, revise, or reject each diff.",
    agent: "Proposes the transform; retries on failure twice.",
    metric: "halt at gate 6",
  },
  {
    num: "04",
    name: "Features",
    you: "Accept in bulk or triage individually.",
    agent: "Drafts 3–5 candidates, tags impact high/med/low.",
    metric: "33 techniques",
  },
  {
    num: "05",
    name: "Train",
    you: "Approve the plan, then the pre-fit review.",
    agent: "Streams reasoning; fits GradientBoosting by default.",
    metric: "2 user gates",
  },
  {
    num: "06",
    name: "Experiments",
    you: "Pick a champion; download the notebook.",
    agent: "Ranks by ROC-AUC; Welch’s keeps ties honest.",
    metric: "top-3 board",
  },
];

const LoopInMotion: React.FC = () => (
  <div
    style={{
      marginTop: 10,
      paddingTop: 10,
      borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 10,
      }}
    >
      <Eyebrow color={COLORS.INK_MUTED}>THE LOOP, STAGE-BY-STAGE</Eyebrow>
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 13,
          color: COLORS.INK_MUTED,
          lineHeight: 1.2,
        }}
      >
        you drive · the agent executes · the notebook records.
      </div>
    </div>

    {/* Column headers mirror the YOU / AGENT split on every row. */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "26px 82px 1fr 1fr 108px",
        columnGap: 12,
        padding: "0 2px 4px",
        borderBottom: `0.5pt solid ${COLORS.HAIRLINE}`,
      }}
    >
      <div />
      <div />
      <HeaderCell label="YOU" color={SECTION["02_HOW"]} />
      <HeaderCell label="AGENT" color={COLORS.INK_MUTED} />
      <HeaderCell label="DETAIL" color={COLORS.INK_MUTED} align="right" />
    </div>

    {LOOP_ROWS.map((row, i) => (
      <div
        key={row.num}
        style={{
          display: "grid",
          gridTemplateColumns: "26px 82px 1fr 1fr 108px",
          columnGap: 12,
          padding: "5px 2px",
          alignItems: "baseline",
          borderBottom:
            i === LOOP_ROWS.length - 1
              ? "none"
              : `0.25pt solid ${COLORS.HAIRLINE}`,
        }}
      >
        {/* Phase number chip — matches the loop ring styling above. */}
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.PAPER,
            background: SECTION["02_HOW"],
            borderRadius: "50%",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            letterSpacing: "0.02em",
            transform: "translateY(1px)",
          }}
        >
          {row.num}
        </div>
        <div
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.INK,
            letterSpacing: "-0.005em",
          }}
        >
          {row.name}
        </div>
        <div
          style={{
            fontFamily: FONTS.SANS,
            fontSize: TYPE.body.size,
            fontWeight: 500,
            color: COLORS.INK,
            lineHeight: 1.35,
          }}
        >
          {row.you}
        </div>
        <div
          style={{
            fontFamily: FONTS.SANS,
            fontSize: TYPE.body.size,
            fontWeight: TYPE.body.weight,
            color: COLORS.INK_MUTED,
            lineHeight: 1.35,
          }}
        >
          {row.agent}
        </div>
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 9,
            fontWeight: 600,
            color: SECTION["02_HOW"],
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            textAlign: "right",
          }}
        >
          {row.metric}
        </div>
      </div>
    ))}

    {/* Footnote coda — ties the table back to the three pillars up top. */}
    <div
      style={{
        marginTop: 8,
        paddingTop: 7,
        borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 13,
          color: COLORS.INK,
          lineHeight: 1.3,
          maxWidth: "4.6in",
        }}
      >
        Chat is how you ask. Plan is how you steer. The notebook is the
        receipt — every row above commits cells you can re-run tomorrow.
      </div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 9,
          fontWeight: 600,
          color: COLORS.INK_MUTED,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        6 phases · 2 gates · 1 record
      </div>
    </div>
  </div>
);

const HeaderCell: React.FC<{
  label: string;
  color: string;
  align?: "left" | "right";
}> = ({ label, color, align = "left" }) => (
  <div
    style={{
      fontFamily: FONTS.MONO,
      fontSize: 9,
      fontWeight: 600,
      color,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      textAlign: align,
    }}
  >
    {label}
  </div>
);
