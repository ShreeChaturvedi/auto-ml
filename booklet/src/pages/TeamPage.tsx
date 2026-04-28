import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { ADVISORS, TEAM_PAGE } from "../content";
import { FlourishUnderline } from "../visuals/FlourishUnderline";

type Person = {
  name: string;
  role: string;
  owned: readonly string[];
};

/** Page 26 — team, advisors, acknowledgements. */
export const TeamPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <BodyPage
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="BUILD · TEAM"
    sectionColor={SECTION["05_BUILD"]}
    eyebrow="§05 · BUILD · TEAM"
    headline="Two engineers. One system."
  >
    {/* Top — 2-column students with round headshots + employer marks */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 28,
        marginTop: 18,
      }}
    >
      <PersonCard
        person={TEAM_PAGE.shree}
        accent={COLORS.MIAMI_RED}
        headshot="/team/shree.jpeg"
        employer={{ mark: "/branding/ebc.webp", label: "Employer · EBC" }}
      />
      <PersonCard
        person={TEAM_PAGE.ayush}
        accent={SECTION["05_BUILD"]}
        headshot="/team/ayush.jpeg"
        employer={{ mark: "/branding/miami-m.svg", label: "Miami University · CS" }}
      />
    </div>

    <hr
      style={{
        border: "none",
        borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
        margin: "28px 0 18px",
      }}
    />

    {/* Advisors — faculty row with 0.5" headshots */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 28,
      }}
    >
      {ADVISORS.map((a, i) => (
        <AdvisorRow
          key={a.name}
          name={a.name}
          role={a.role}
          headshot={i === 0 ? "/team/samer.png" : "/team/stahr.png"}
        />
      ))}
    </div>

    {/* Acknowledgements — single italic line */}
    <p
      style={{
        marginTop: 22,
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 13,
        lineHeight: 1.4,
        color: COLORS.INK_MUTED,
        maxWidth: "6.4in",
      }}
    >
      {TEAM_PAGE.acks}
    </p>

    {/* BUILT ON band — pinned to lower portion, text-only per spec */}
    <div
      style={{
        position: "absolute",
        left: "0.75in",
        right: "0.75in",
        bottom: "1.35in",
        borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
        paddingTop: 12,
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 14,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: COLORS.INK_MUTED,
          whiteSpace: "nowrap",
        }}
      >
        Built on
      </span>
      <span
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.06em",
          color: COLORS.INK,
          lineHeight: 1.4,
          textAlign: "right",
        }}
      >
        LangGraph · Jupyter Kernel Gateway · scikit-learn · pandas
      </span>
    </div>
  </BodyPage>
);

const PersonCard: React.FC<{
  person: Person;
  accent: string;
  headshot: string;
  employer: { mark: string; label: string };
}> = ({ person, accent, headshot, employer }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {/* 0.75" round headshot above the name */}
    <div
      style={{
        width: "0.75in",
        height: "0.75in",
        borderRadius: "50%",
        overflow: "hidden",
        border: `1pt solid ${COLORS.HAIRLINE}`,
        marginBottom: 6,
        background: COLORS.PAPER_ELEVATED,
      }}
    >
      <img
        src={headshot}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
    <h2
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 28,
        fontWeight: 400,
        color: COLORS.INK,
        margin: 0,
        lineHeight: 1.1,
      }}
    >
      {person.name}
    </h2>
    <div style={{ width: "60%" }}>
      <FlourishUnderline
        width="100%"
        height={10}
        color={accent}
        strokeWidth={1.25}
      />
    </div>
    <div
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 11,
        fontWeight: 500,
        color: COLORS.INK_MUTED,
        letterSpacing: "-0.005em",
        marginTop: 4,
      }}
    >
      {person.role}
    </div>
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: "6px 0 0",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {person.owned.map((item) => (
        <li
          key={item}
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 10,
            fontWeight: 500,
            color: COLORS.INK,
            letterSpacing: "0.02em",
            lineHeight: 1.3,
          }}
        >
          {item}
        </li>
      ))}
    </ul>

    {/* Employer mark — a small, muted row underneath the credits */}
    <div
      style={{
        marginTop: 10,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <img
        src={employer.mark}
        alt=""
        style={{
          height: 18,
          width: "auto",
          objectFit: "contain",
          opacity: 0.85,
        }}
      />
      <span
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
        }}
      >
        {employer.label}
      </span>
    </div>
  </div>
);

const AdvisorRow: React.FC<{
  name: string;
  role: string;
  headshot: string;
}> = ({ name, role, headshot }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <div
      style={{
        width: "0.5in",
        height: "0.5in",
        borderRadius: "50%",
        overflow: "hidden",
        border: `0.75pt solid ${COLORS.HAIRLINE}`,
        flexShrink: 0,
        background: COLORS.PAPER_ELEVATED,
      }}
    >
      <img
        src={headshot}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: TYPE.eyebrow.size,
          fontWeight: 600,
          color: COLORS.INK_MUTED,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {role}
      </div>
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: TYPE.subheadMedium.size,
          color: COLORS.INK,
          lineHeight: TYPE.subheadMedium.lh,
        }}
      >
        {name}
      </div>
    </div>
  </div>
);
