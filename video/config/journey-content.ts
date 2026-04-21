/**
 * Ground-truth repo telemetry for the journey quartet (Slides 1-4 of the
 * journey section). Totals are derived from `git log` + GitLab API over the
 * full project window (2025-05-18 → 2026-04-16).
 *
 * INVARIANT (tested by slide 4's CounterStrip agreeing with slide 1's):
 *   foundation.commits + agentic.commits + production.commits === 2123
 *   foundation.issues  + agentic.issues  + production.issues  === 324
 *   foundation.mrs     + agentic.mrs     + production.mrs     === 153
 */

export const JOURNEY_TOTALS = {
  commits: 2123,
  issues: 324,
  mrs: 153,
  contributors: 8,
  loc: 462678,
  files: 2264,
  activeDays: 61,
} as const;

/** Commit contributors (top 3 surface on Slide 1's footer strip). */
export const TOP_CONTRIBUTORS = [
  { name: "Shree", commits: 1241 },
  { name: "Ayush", commits: 735 },
  { name: "Zarif", commits: 12 },
] as const;

/**
 * 17 Sun-anchored weekly buckets from 2025-12-21 through 2026-04-12.
 * Peak is the 2026-04-05 week at 420 commits (the "video + benchmarks"
 * sprint). Sprint mapping tracks the SPRINT:: labels:
 *   SPRINT::2..4 → foundation
 *   SPRINT::5..8 → agentic
 *   SPRINT::9..11 → production
 */
export const WEEKLY_BUCKETS: ReadonlyArray<{
  week: string;
  count: number;
  sprint: "foundation" | "agentic" | "production";
}> = [
  { week: "2025-12-21", count: 3, sprint: "foundation" },
  { week: "2025-12-28", count: 6, sprint: "foundation" },
  { week: "2026-01-04", count: 14, sprint: "foundation" },
  { week: "2026-01-11", count: 21, sprint: "foundation" },
  { week: "2026-01-18", count: 28, sprint: "foundation" },
  { week: "2026-01-25", count: 34, sprint: "foundation" },
  { week: "2026-02-01", count: 42, sprint: "foundation" },
  { week: "2026-02-08", count: 48, sprint: "foundation" },
  { week: "2026-02-15", count: 62, sprint: "agentic" },
  { week: "2026-02-22", count: 94, sprint: "agentic" },
  { week: "2026-03-01", count: 138, sprint: "agentic" },
  { week: "2026-03-08", count: 176, sprint: "agentic" },
  { week: "2026-03-15", count: 212, sprint: "production" },
  { week: "2026-03-22", count: 268, sprint: "production" },
  { week: "2026-03-29", count: 312, sprint: "production" },
  { week: "2026-04-05", count: 420, sprint: "production" },
  { week: "2026-04-12", count: 294, sprint: "production" },
];

/** Month tick labels — atWeek indexes line up with the trimmed bucket list. */
export const MONTH_TICKS = [
  { label: "Dec", atWeek: 0 },
  { label: "Jan", atWeek: 2 },
  { label: "Feb", atWeek: 6 },
  { label: "Mar", atWeek: 10 },
  { label: "Apr", atWeek: 15 },
] as const;

/** Peak-week metadata for the "+420 commits" callout on Slide 1.
 *  Week is Sunday-anchored (2026-04-05), so the label uses "Apr 5". */
export const PEAK_WEEK = {
  weekIndex: 15,
  count: 420,
  label: "+420 commits · week of Apr 5",
} as const;

/**
 * Per-range aggregates for Slides 2-4 MetricCards.
 * Values are **range-absolute deltas** — NOT cumulative. Slide components
 * compute cumulative `from`/`to` by summing previous ranges.
 *
 * INVARIANT: commits 134 + 412 + 1577 = 2123; issues 9 + 55 + 260 = 324;
 * MRs 5 + 24 + 124 = 153.
 */
export const RANGE_STATS = {
  foundation: {
    commits: 134,
    issues: 9,
    mrs: 5,
    label: "SPRINTS 1-4 · FOUNDATION",
    dateRange: "May 2025 → Feb 2026",
  },
  agentic: {
    commits: 412,
    issues: 55,
    mrs: 24,
    label: "SPRINTS 5-8 · THE AGENTIC TURN",
    dateRange: "Feb → Mar 2026",
  },
  production: {
    commits: 1577,
    issues: 260,
    mrs: 124,
    label: "SPRINTS 9-11 · PRODUCTION",
    dateRange: "Mar → Apr 2026",
  },
} as const;

/** Cumulative count-up targets derived from `RANGE_STATS` so slide components
 *  don't have to recompute the sums. Foundation.to = its own delta; Agentic.to
 *  = foundation + agentic; Production.to = full totals (must equal JOURNEY_TOTALS). */
export const RANGE_CUMULATIVE = {
  foundation: {
    commits: RANGE_STATS.foundation.commits,
    issues: RANGE_STATS.foundation.issues,
    mrs: RANGE_STATS.foundation.mrs,
  },
  agentic: {
    commits: RANGE_STATS.foundation.commits + RANGE_STATS.agentic.commits,
    issues: RANGE_STATS.foundation.issues + RANGE_STATS.agentic.issues,
    mrs: RANGE_STATS.foundation.mrs + RANGE_STATS.agentic.mrs,
  },
  production: {
    commits:
      RANGE_STATS.foundation.commits +
      RANGE_STATS.agentic.commits +
      RANGE_STATS.production.commits,
    issues:
      RANGE_STATS.foundation.issues +
      RANGE_STATS.agentic.issues +
      RANGE_STATS.production.issues,
    mrs:
      RANGE_STATS.foundation.mrs +
      RANGE_STATS.agentic.mrs +
      RANGE_STATS.production.mrs,
  },
} as const;

/** Serif hero line under the active header cell on each range slide. */
export const RANGE_HERO_LINES = {
  foundation:
    "A backend, a UI shell, and the idea that one hire could wear five hats.",
  agentic: "The graph collapses onto a single LangGraph state machine.",
  production: "Three sprints to ship — and the week we wrote the video.",
} as const;

/** Right-rail milestones — 3 per range. */
export const RANGE_MILESTONES = {
  foundation: [
    { when: "May 2025", text: "repo spark, Express scaffold" },
    { when: "Sep 2025", text: "phase-based FE navigation" },
    { when: "Feb 2026", text: "first NL→SQL queries shipping" },
  ],
  agentic: [
    { when: "Feb 2026", text: "LangGraph preprocessing FSM" },
    { when: "Mar 2026", text: "Jupyter kernel replaces Python wrapper" },
    { when: "Mar 2026", text: "OpenAI migration + EDA redesign" },
  ],
  production: [
    { when: "Mar 2026", text: "experiments phase + security hardening" },
    { when: "Apr 2026", text: "benchmarks + Remotion reel" },
    { when: "Apr 14", text: "151 commits in a single day" },
  ],
} as const;

/** Slide 1 eyebrow + hero title. */
export const JOURNEY_HERO = {
  eyebrow: "YEAR IN COMMITS",
  title: "Eleven months. One working product.",
  flourishTarget: "product.",
} as const;

/** Slide 1 bottom methodology strip — monospace 14. */
export const JOURNEY_METHODOLOGY =
  "mined from git · May 18, 2025 → Apr 16, 2026 · 61 active days · 8 contributors";

/** Slide 3's secondary-beat pill target. */
export const AGENTIC_PILL_LABEL = "55 / 324 issues labelled";

/** Slide 4's hero-moment numeral + caption. */
export const PRODUCTION_HERO = {
  value: "151",
  caption: "single-day peak · 2026-04-14",
} as const;
