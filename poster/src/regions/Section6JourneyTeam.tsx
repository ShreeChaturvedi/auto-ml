import React from "react";
import { COLORS, FONTS, TYPE, hexWithAlpha } from "../tokens";
import { CommitBarRow } from "../visuals/CommitBarRow";
import { SectionFrame } from "./SectionFrame";
import { JOURNEY, STUDENTS, ADVISORS } from "../content";

// ---------------------------------------------------------------------------
// Icon helpers (inlined Lucide paths — matches the §1/§2/§3 fact-strip
// pattern). Stroke-based, 24×24 viewBox, scaled down to match the strip.
// ---------------------------------------------------------------------------

const iconProps = (color: string): React.SVGAttributes<SVGElement> => ({
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: 2.25,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

// lucide: git-commit-horizontal
const IconCommit: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconProps(color)} aria-hidden>
    <circle cx={12} cy={12} r={3} />
    <line x1={3} y1={12} x2={9} y2={12} />
    <line x1={15} y1={12} x2={21} y2={12} />
  </svg>
);

// lucide: circle-dot (issue)
const IconIssue: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconProps(color)} aria-hidden>
    <circle cx={12} cy={12} r={10} />
    <circle cx={12} cy={12} r={3} fill={color} stroke="none" />
  </svg>
);

// lucide: git-merge
const IconMerge: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconProps(color)} aria-hidden>
    <circle cx={18} cy={18} r={3} />
    <circle cx={6} cy={6} r={3} />
    <path d="M6 21V9a9 9 0 0 0 9 9" />
  </svg>
);

// lucide: calendar-check
const IconActiveDays: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconProps(color)} aria-hidden>
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <rect width={18} height={18} x={3} y={4} rx={2} />
    <path d="M3 10h18" />
    <path d="m9 16 2 2 4-4" />
  </svg>
);

type Total = {
  value: string;
  label: string;
  color: string;
  icon: React.ReactNode;
};

const TOTALS: Total[] = [
  {
    value: JOURNEY.commits.toLocaleString(),
    label: "commits",
    color: COLORS.MIAMI_RED,
    icon: <IconCommit color={COLORS.MIAMI_RED} />,
  },
  {
    value: JOURNEY.issues.toLocaleString(),
    label: "issues",
    color: COLORS.ACCENT,
    icon: <IconIssue color={COLORS.ACCENT} />,
  },
  {
    value: JOURNEY.mrs.toString(),
    label: "merge requests",
    color: COLORS.SUCCESS,
    icon: <IconMerge color={COLORS.SUCCESS} />,
  },
  {
    value: JOURNEY.activeDays.toString(),
    label: "active days",
    color: COLORS.MIAMI_RED,
    icon: <IconActiveDays color={COLORS.MIAMI_RED} />,
  },
];

/**
 * §6 · THE JOURNEY & TEAM — compressed into a single 16in × 15in cell in the
 * far-right column of row 2. Compared to the prior 2-wide composition this
 * is the "narrow" variant: totals in a 2×2 grid, a smaller commit chart,
 * 5 milestones (down from 7), and a single-row 4-portrait team band.
 *
 *   ┌─ BAND A · Totals (2×2 grid) ───────────────────────────
 *   │  commits · issues · MRs · active days (36pt mono)
 *   │
 *   ┌─ BAND B · Commit chart ────────────────────────────────
 *   │  CommitBarRow at 1280 × 360 (fits single cell width)
 *   │
 *   ┌─ BAND C · Milestones ──────────────────────────────────
 *   │  5 rows: date (mono 16pt ACCENT_DEEP, 130px gutter)
 *   │           + one-line description (sans 17pt)
 *   │
 *   ┌─ BAND D · Team ────────────────────────────────────────
 *   │  4 portraits at 80px in a single horizontal row
 *   └────────────────────────────────────────────────────────
 */

/** Ten milestones laid out as a 5×2 grid so the reader scans the arc in
 *  two columns. Each row is one short clause; the full story is the grid. */
const MILESTONES: ReadonlyArray<{ when: string; what: string }> = [
  { when: "May 2025", what: "repo spark · Express scaffold · first Postgres migrations" },
  { when: "Jul 2025", what: "auth + project workspaces · upload pipeline" },
  { when: "Sep 2025", what: "phase-based FE navigation · first NL→SQL queries" },
  { when: "Oct 2025", what: "sandboxed Python runtime · Docker pool" },
  { when: "Nov 2025", what: "live notebook cells · WebSocket state sync" },
  { when: "Dec 2025", what: "MCP tool registry · approval gates prototype" },
  { when: "Jan 2026", what: "audit ledger v1 · replayable workflow events" },
  { when: "Feb 2026", what: "LangGraph preprocessing FSM · OpenAI migration" },
  { when: "Mar 2026", what: "Jupyter kernel · experiments phase · guardrails" },
  { when: "Apr 2026", what: "benchmarks · Remotion reel · expo launch" },
];

/**
 * Two portrait variants share the same avatar + name treatment. Students
 * show their major in Instrument Serif italic (sentence-case, no tracking);
 * advisors keep the uppercase sans `role` line.
 */
type PortraitKind = "student" | "advisor";
type PersonRow = {
  name: string;
  avatar: string;
  line: string;
  kind: PortraitKind;
};

const PEOPLE: ReadonlyArray<PersonRow> = [
  ...STUDENTS.map((s): PersonRow => ({
    name: s.name,
    avatar: s.avatar,
    line: s.major,
    kind: "student",
  })),
  ...ADVISORS.map((a): PersonRow => ({
    name: a.name,
    avatar: a.avatar,
    line: a.role,
    kind: "advisor",
  })),
];

export const Section6JourneyTeam: React.FC = () => (
  <SectionFrame
    eyebrow="THE JOURNEY & TEAM"
    number="§6"
    headline="Engineering Team"
    footnote={{
      label: "Source",
      text: "Commits pulled from gitlab.csi.miamioh.edu via GitLab REST API",
    }}
  >
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 20,
        minHeight: 0,
        paddingBottom: 4,
      }}
    >
      {/* ───────── BAND A · Milestones ───────── */}
      <MilestonesColumn />

      {/* ───────── BAND B · Commit chart, sized to single-cell width ───────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CommitBarRow width={1280} height={360} />
      </div>

      {/* ───────── BAND C · Totals — borderless 4-across strip with
       *  hairline dividers, matching §1 / §2 / §3. ───────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 0,
          paddingTop: 4,
          borderTop: `1px solid ${COLORS.HAIRLINE}`,
          borderBottom: `1px solid ${COLORS.HAIRLINE}`,
          paddingBottom: 10,
        }}
      >
        {TOTALS.map((t, i) => (
          <TotalCell key={t.label} total={t} showDivider={i > 0} />
        ))}
      </div>

      {/* ───────── BAND D · Team — 4 portraits in one row ───────── */}
      <TeamRow />
    </div>
  </SectionFrame>
);

// ---------------------------------------------------------------------------
// Band A — Total cell (compressed: 36pt mono instead of 50pt for single-cell)
// ---------------------------------------------------------------------------

const TotalCell: React.FC<{ total: Total; showDivider: boolean }> = ({
  total,
  showDivider,
}) => (
  <div
    style={{
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      paddingTop: 10,
      paddingRight: 12,
      paddingLeft: showDivider ? 12 : 0,
      borderLeft: showDivider ? `1px solid ${COLORS.HAIRLINE}` : "none",
      minWidth: 0,
    }}
  >
    <div
      style={{
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: 8,
        background: hexWithAlpha(total.color, 0.1),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {total.icon}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 40,
          fontWeight: 700,
          color: total.color,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.03em",
          lineHeight: 0.95,
        }}
      >
        {total.value}
      </div>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 13,
          fontWeight: 700,
          color: COLORS.INK,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          lineHeight: 1.15,
        }}
      >
        {total.label}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Band C — Milestones timeline (5 rows, 130px date gutter, mono 16pt date)
// ---------------------------------------------------------------------------

/** 5×2 grid — reads top-to-bottom by column so the timeline flows left
 *  then right. At 10 rows × 2 cols we fit every milestone without cramping. */
const MilestonesColumn: React.FC = () => {
  const halfway = Math.ceil(MILESTONES.length / 2);
  const leftColumn = MILESTONES.slice(0, halfway);
  const rightColumn = MILESTONES.slice(halfway);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ColumnLabel>Milestones</ColumnLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 24,
          rowGap: 0,
        }}
      >
        <MilestoneList rows={leftColumn} />
        <MilestoneList rows={rightColumn} />
      </div>
    </div>
  );
};

const MilestoneList: React.FC<{
  rows: ReadonlyArray<{ when: string; what: string }>;
}> = ({ rows }) => (
  <div style={{ display: "flex", flexDirection: "column", rowGap: 8 }}>
    {rows.map((m) => (
      <div
        key={m.when}
        style={{
          display: "grid",
          gridTemplateColumns: "108px 1fr",
          columnGap: 14,
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: COLORS.ACCENT_DEEP,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {m.when}
        </span>
        <span
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 19,
            fontWeight: 500,
            color: COLORS.INK,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
          }}
        >
          {m.what}
        </span>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Band D — Team row: 4 portraits in one horizontal band, with a vertical
// hairline spacer between the two students (first pair) and the two
// advisors (second pair) so the two subgroups read as intentional columns.
// ---------------------------------------------------------------------------

const PORTRAIT_SIZE = 100;

const TeamRow: React.FC = () => {
  const students = PEOPLE.filter((p) => p.kind === "student");
  const advisors = PEOPLE.filter((p) => p.kind === "advisor");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ColumnLabel>Team</ColumnLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto 1fr 1fr",
          columnGap: 14,
          alignItems: "start",
        }}
      >
        {students.map((p) => (
          <Portrait key={p.name} person={p} />
        ))}
        {/* Vertical spacer between students and advisors */}
        <div
          aria-hidden
          style={{
            width: 1,
            alignSelf: "stretch",
            background: COLORS.HAIRLINE,
            marginInline: 4,
          }}
        />
        {advisors.map((p) => (
          <Portrait key={p.name} person={p} />
        ))}
      </div>
    </div>
  );
};

const Portrait: React.FC<{ person: PersonRow }> = ({ person }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: 8,
      minWidth: 0,
    }}
  >
    <div
      style={{
        width: PORTRAIT_SIZE,
        height: PORTRAIT_SIZE,
        borderRadius: "50%",
        overflow: "hidden",
        border: `2px solid ${COLORS.INK}`,
        boxSizing: "content-box",
        flexShrink: 0,
      }}
    >
      <img
        src={person.avatar}
        alt={`${person.name} portrait`}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
    <div
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 21,
        fontWeight: 700,
        color: COLORS.INK,
        letterSpacing: "-0.005em",
        lineHeight: 1.15,
        maxWidth: "100%",
        overflowWrap: "break-word",
      }}
    >
      {person.name}
    </div>
    <div
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "normal",
        fontSize: 19,
        fontWeight: 400,
        color: COLORS.INK,
        letterSpacing: "0",
        lineHeight: 1.2,
        maxWidth: "100%",
      }}
    >
      {person.line}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Shared — small uppercase label used above each column.
// ---------------------------------------------------------------------------

const ColumnLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: FONTS.SANS,
      fontSize: TYPE.subEyebrow.size,
      fontWeight: TYPE.subEyebrow.weight,
      letterSpacing: TYPE.subEyebrow.tracking,
      textTransform: "uppercase",
      color: COLORS.INK_MUTED,
      lineHeight: TYPE.subEyebrow.lh,
    }}
  >
    {children}
  </div>
);
