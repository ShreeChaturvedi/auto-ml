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

/** Small 6-phase loop ring at the bottom of the page. */
const PhaseLoopDiagram: React.FC = () => {
  const phases = HOW.phases;
  const cx = 300;
  const cy = 90;
  const r = 76;
  return (
    <div
      style={{
        marginTop: 36,
        paddingTop: 16,
        borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
      }}
    >
      <Eyebrow color={COLORS.INK_MUTED} style={{ marginBottom: 8 }}>
        THE 6-PHASE LOOP
      </Eyebrow>
      <svg width={600} height={180} viewBox={`0 0 600 180`} style={{ display: "block" }}>
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
                r={10}
                fill={SECTION["02_HOW"]}
                stroke={COLORS.PAPER}
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={y + 3}
                textAnchor="middle"
                fontFamily={FONTS.MONO}
                fontSize={8}
                fontWeight={700}
                fill={COLORS.PAPER}
                style={{ letterSpacing: "0.02em" }}
              >
                {phase.num}
              </text>
              {/* radial label, offset outward */}
              <text
                x={cx + Math.cos(a) * (r + 18)}
                y={cy + Math.sin(a) * (r + 18) + 3}
                textAnchor="middle"
                fontFamily={FONTS.SANS}
                fontSize={9}
                fontWeight={600}
                fill={COLORS.INK_MUTED}
                style={{ letterSpacing: "-0.005em" }}
              >
                {phase.name}
              </text>
            </g>
          );
        })}
        {/* label at center */}
        <text
          x={cx}
          y={cy - 3}
          textAnchor="middle"
          fontFamily={FONTS.SERIF}
          fontStyle="italic"
          fontSize={14}
          fill={COLORS.INK_MUTED}
        >
          upload
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontFamily={FONTS.SERIF}
          fontStyle="italic"
          fontSize={14}
          fill={COLORS.INK_MUTED}
        >
          to ship.
        </text>
      </svg>
    </div>
  );
};
