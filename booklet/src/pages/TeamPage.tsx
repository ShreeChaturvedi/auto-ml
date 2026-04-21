import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, SECTION } from "../theme";
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
    {/* Top — 2-column students */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 28,
        marginTop: 14,
      }}
    >
      <PersonCard person={TEAM_PAGE.shree} accent={COLORS.MIAMI_RED} />
      <PersonCard person={TEAM_PAGE.ayush} accent={SECTION["05_BUILD"]} />
    </div>

    <hr
      style={{
        border: "none",
        borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
        margin: "26px 0 18px",
      }}
    />

    {/* Middle — advisors */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 28,
      }}
    >
      {ADVISORS.map((a) => (
        <div key={a.name}>
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 8,
              fontWeight: 600,
              color: COLORS.INK_MUTED,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {a.role}
          </div>
          <div
            style={{
              fontFamily: FONTS.SERIF,
              fontStyle: "italic",
              fontSize: 18,
              color: COLORS.INK,
              lineHeight: 1.2,
            }}
          >
            {a.name}
          </div>
        </div>
      ))}
    </div>

    {/* Bottom — acknowledgements + built-on, rendered as two distinct lines */}
    <div
      style={{
        marginTop: 24,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxWidth: "6.4in",
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 13,
          lineHeight: 1.4,
          color: COLORS.INK_MUTED,
        }}
      >
        {TEAM_PAGE.acks}
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: FONTS.MONO,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.04em",
          lineHeight: 1.4,
          color: COLORS.INK_SUBTLE,
        }}
      >
        {TEAM_PAGE.builtOn}
      </p>
    </div>

    {/* Spine quote — full width across the page bottom */}
    <div
      style={{
        position: "absolute",
        left: "0.75in",
        right: "0.75in",
        bottom: "1in",
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 14,
        color: COLORS.INK_SUBTLE,
        textAlign: "center",
        letterSpacing: "0.02em",
      }}
    >
      “{TEAM_PAGE.spineQuote}”
    </div>
  </BodyPage>
);

const PersonCard: React.FC<{
  person: Person;
  accent: string;
}> = ({ person, accent }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
  </div>
);

