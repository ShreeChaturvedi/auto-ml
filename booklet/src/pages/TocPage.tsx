import React from "react";
import { Page } from "../primitives/Page";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { BRAND, INSTITUTION, STUDENTS, CHAPTERS } from "../content";

/**
 * Title page + table of contents (page 03).
 *
 * Top half: left — full title / authors / colophon; right — color-coded TOC
 * with per-chapter glyph, tagline, and page range.
 *
 * Bottom half: editorial bands — "Who this is for", "Reading paths", an
 * at-a-glance stat strip, and a micro-glossary — to give the page the weight
 * its front-matter role asks for.
 */
export const TocPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <Page
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="FRONTMATTER"
    sectionColor={COLORS.INK_MUTED}
    hideFooter
  >
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 18 }}>
      {/* ─── Upper band — title · TOC ──────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: "0.5in",
        }}
      >
        {/* Left — full title / authors */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: TYPE.eyebrow.size,
              fontWeight: 600,
              letterSpacing: TYPE.eyebrow.tracking,
              textTransform: "uppercase",
              color: COLORS.INK_MUTED,
            }}
          >
            Vol. 01 · System Card
          </div>
          <h1
            style={{
              fontFamily: FONTS.SANS,
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: COLORS.INK,
              margin: 0,
            }}
          >
            {BRAND.name}
          </h1>
          <p
            style={{
              fontFamily: FONTS.SERIF,
              fontStyle: "italic",
              fontSize: TYPE.subheadLarge.size,
              lineHeight: TYPE.subheadLarge.lh,
              color: COLORS.INK_MUTED,
              margin: 0,
            }}
          >
            {BRAND.subtitle}
          </p>

          <div style={{ marginTop: 16 }}>
            <LabelValue
              label="Authors"
              value={STUDENTS.map((s) => s.name).join(" · ")}
            />
            <LabelValue label="Advisor" value="Samer Khamaiseh, Ph.D." />
            <LabelValue
              label="Course"
              value={`${INSTITUTION.course} · ${INSTITUTION.track}`}
            />
            <LabelValue label="Date" value="April 2026" />
          </div>
        </div>

        {/* Right — TOC */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: TYPE.eyebrow.size,
              fontWeight: 600,
              letterSpacing: TYPE.eyebrow.tracking,
              textTransform: "uppercase",
              color: COLORS.INK_MUTED,
            }}
          >
            Contents
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 2 }}>
            {CHAPTERS.map((ch) => (
              <TocRow
                key={ch.num}
                num={ch.num}
                name={ch.name}
                tagline={CHAPTER_TAGLINES[ch.name] ?? ""}
                pages={ch.pages}
                color={SECTION[ch.sectionKey]}
                glyph={CHAPTER_GLYPHS[ch.name] ?? ""}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ─── Divider rule ────────────────────────────────────────────── */}
      <div
        style={{
          borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
          marginTop: 4,
        }}
      />

      {/* ─── Lower band — editorial grid ─────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          columnGap: "0.4in",
          rowGap: 18,
        }}
      >
        <EditorialBlock
          eyebrow="WHO THIS IS FOR"
          rows={AUDIENCE_ROWS}
        />
        <EditorialBlock
          eyebrow="HOW TO READ IT"
          rows={READING_PATHS}
        />
        <EditorialBlock
          eyebrow="AT A GLANCE"
          rows={AT_A_GLANCE}
        />
      </div>

      {/* Micro-glossary strip */}
      <div>
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: TYPE.eyebrow.size,
            fontWeight: 600,
            letterSpacing: TYPE.eyebrow.tracking,
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
            marginBottom: 8,
          }}
        >
          Glossary at a glance
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            columnGap: 12,
            rowGap: 0,
            borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
            borderBottom: `0.5pt solid ${COLORS.HAIRLINE}`,
            padding: "10px 0",
          }}
        >
          {GLOSSARY.map((g) => (
            <div key={g.term} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: COLORS.INK,
                }}
              >
                {g.term}
              </div>
              <div
                style={{
                  fontFamily: FONTS.SANS,
                  fontSize: 9,
                  lineHeight: 1.3,
                  color: COLORS.INK_MUTED,
                  letterSpacing: "-0.005em",
                }}
              >
                {g.def}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reading-path waypoint timeline — the 5 chapters as a journey. */}
      <ReadingPath />

      {/* Pull-quote teaser + colophon — sits directly after the reading
          path. `flex: 1` on the spacer-sibling gets the remaining vertical
          real-estate so the pull-quote rail floats near the page foot. */}
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          columnGap: "0.4in",
          alignItems: "center",
          borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
          paddingTop: 14,
        }}
      >
        <p
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 17,
            lineHeight: 1.3,
            color: COLORS.INK,
            margin: 0,
            maxWidth: "4.4in",
            borderLeft: `2px solid ${COLORS.MIAMI_RED}`,
            paddingLeft: 14,
          }}
        >
          A printed walkthrough of a live agent — the why, the how, and the
          receipts. Read it with the demo open.
        </p>
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: COLORS.INK_SUBTLE,
            lineHeight: 1.55,
            textAlign: "right",
          }}
        >
          © 2026 · Miami University · CSE 449
          <br />
          Capstone Senior Design · Track 2
          <br />
          Advised by Dr. Khamaiseh
        </div>
      </div>
    </div>
  </Page>
);

// ──────────────────────────────────────────────────────────────────────
// Data — page-local copy; intentionally not promoted to content.ts since
// nothing else in the booklet consumes these.
// ──────────────────────────────────────────────────────────────────────

/** Chapter taglines — whispered secondary line next to each chapter name. */
const CHAPTER_TAGLINES: Record<string, string> = {
  WHY: "the 80% problem",
  HOW: "plan-with-agent loop",
  INSIDE: "FSM · MCP · sandbox",
  PROOF: "7× · top 15%",
  BUILD: "11 months · 2 engineers",
};

/** Glyph rendered inside each chapter swatch. Monospace, dense, readable. */
const CHAPTER_GLYPHS: Record<string, string> = {
  WHY: "?",
  HOW: "→",
  INSIDE: "◆",
  PROOF: "✓",
  BUILD: "★",
};

const AUDIENCE_ROWS = [
  { key: "Engineers",    val: "see the FSM, MCP registry, sandbox contract." },
  { key: "ML research",  val: "skim the benchmark methodology on page 20–22." },
  { key: "Reviewers",    val: "start at §01, finish at the team spread." },
] as const;

const READING_PATHS = [
  { key: "Skim · 5 min",    val: "headlines, pull-quotes, stat strips only." },
  { key: "Deep · 20 min",   val: "read cover-to-cover — built for one sitting." },
  { key: "Diagrams only",   val: "pages 16–19 — FSM, registry, sandbox." },
] as const;

const AT_A_GLANCE = [
  { key: "11 months",   val: "from first commit to expo." },
  { key: "1,989 commits", val: "across two engineers, peak 420/wk." },
  { key: "5 chapters · 27 pages", val: "read in twenty minutes." },
] as const;

const GLOSSARY = [
  { term: "FSM",       def: "state machine that governs preprocessing." },
  { term: "MCP",       def: "tool contract the agent uses to see the app." },
  { term: "Sandbox",   def: "Docker container with hard CPU/RAM caps." },
  { term: "Approval",  def: "user-in-loop gate before any cell runs." },
  { term: "NL→SQL",    def: "plain English compiled to read-only SELECT." },
  { term: "Guardrail", def: "test battery for silent data flaws." },
] as const;

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

const LabelValue: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "72px 1fr",
      alignItems: "baseline",
      marginBottom: 5,
    }}
  >
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: TYPE.eyebrow.size,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 12,
        fontWeight: 500,
        color: COLORS.INK,
        letterSpacing: "-0.005em",
      }}
    >
      {value}
    </div>
  </div>
);

const TocRow: React.FC<{
  num: string;
  name: string;
  tagline: string;
  pages: string;
  color: string;
  glyph: string;
}> = ({ num, name, tagline, pages, color, glyph }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "0.45in 32px 1fr auto",
      alignItems: "center",
      columnGap: 10,
      borderBottom: `0.5pt solid ${COLORS.HAIRLINE}`,
      paddingBottom: 7,
    }}
  >
    {/* Color swatch with glyph overlay — no longer a plain rect. */}
    <div
      style={{
        width: "0.45in",
        height: 34,
        background: color,
        borderRadius: 3,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#FFF",
        fontFamily: FONTS.MONO,
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {glyph}
    </div>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 16,
        fontWeight: 700,
        color: COLORS.INK,
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {num}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 20,
          color: COLORS.INK,
          lineHeight: 1,
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: TYPE.subheadSmall.size,
          lineHeight: TYPE.subheadSmall.lh,
          color: COLORS.INK_SUBTLE,
        }}
      >
        {tagline}
      </div>
    </div>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 10,
        fontWeight: 600,
        color: COLORS.INK_MUTED,
        letterSpacing: "0.04em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {pages}
    </div>
  </div>
);

/**
 * A 5-waypoint horizontal timeline of the chapters. The full-width band
 * visually ties the TOC to the rest of the lower editorial half and
 * doubles as a "reading path" aid. Intentionally low-key — it's the
 * hollow pin, not the hero.
 */
const ReadingPath: React.FC = () => {
  const stops = CHAPTERS.map((ch) => ({
    num: ch.num,
    name: ch.name,
    color: SECTION[ch.sectionKey],
    pages: ch.pages,
  }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: TYPE.eyebrow.size,
            fontWeight: 600,
            letterSpacing: TYPE.eyebrow.tracking,
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
          }}
        >
          Reading path
        </div>
        <div
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 11,
            color: COLORS.INK_SUBTLE,
          }}
        >
          five chapters · one sitting
        </div>
      </div>
      <div style={{ position: "relative", padding: "8px 0 4px" }}>
        {/* Background rule through the center of the waypoints */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "4%",
            right: "4%",
            borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${stops.length}, 1fr)`,
            position: "relative",
          }}
        >
          {stops.map((s) => (
            <div
              key={s.num}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: s.color,
                  border: `2px solid ${COLORS.PAPER}`,
                  boxShadow: `0 0 0 1pt ${s.color}`,
                }}
              />
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: COLORS.INK,
                  marginTop: 2,
                }}
              >
                {s.num} · {s.name}
              </div>
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 9,
                  letterSpacing: "0.04em",
                  color: COLORS.INK_SUBTLE,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                pp. {s.pages}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Three-column editorial block used under the TOC. Each row is a short
 * key/value pair — key in uppercase mono, value in serif italic for
 * visual rhythm against the sans-heavy upper band.
 */
const EditorialBlock: React.FC<{
  eyebrow: string;
  rows: ReadonlyArray<{ key: string; val: string }>;
}> = ({ eyebrow, rows }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: TYPE.eyebrow.size,
        fontWeight: 600,
        letterSpacing: TYPE.eyebrow.tracking,
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
      }}
    >
      {eyebrow}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: COLORS.INK,
            }}
          >
            {r.key}
          </div>
          <div
            style={{
              fontFamily: FONTS.SERIF,
              fontStyle: "italic",
              fontSize: 12.5,
              lineHeight: 1.3,
              color: COLORS.INK_MUTED,
              letterSpacing: "-0.005em",
            }}
          >
            {r.val}
          </div>
        </div>
      ))}
    </div>
  </div>
);
