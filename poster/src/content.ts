/**
 * Single source of truth for every copy string, data point, and attribution
 * on the poster. Numbers are ported 1:1 from `video/config/*-content.ts`;
 * claims are ported 1:1 from `video/remotion/scenes/Slide/TeamSlide.tsx`
 * and `AcknowledgementsSlide.tsx`. If a string appears elsewhere in this
 * repo, it must match here verbatim or the content audit fails.
 */

// ---------------------------------------------------------------------------
// Product brand
// ---------------------------------------------------------------------------

export const BRAND = {
  name: "Agentic AutoML Platform",
  subtitle: "From dataset to deployed models, agentically and autonomously.",
  liveUrl: "agentic-automl.vercel.app",
  qrTarget: "https://agentic-automl.vercel.app",
} as const;

// ---------------------------------------------------------------------------
// Institutional chrome
// ---------------------------------------------------------------------------

export const INSTITUTION = {
  university: "Miami University",
  course: "CSE 449",
  track: "Senior Design Project",
  year: "2026",
  caption: "CSE 449 · Senior Design Project · 2026",
  captionFull: "MIAMI UNIVERSITY · CSE 449 · SENIOR DESIGN PROJECT · 2026",
} as const;

// ---------------------------------------------------------------------------
// Team (verbatim from video/remotion/scenes/Slide/TeamSlide.tsx:105-134)
// ---------------------------------------------------------------------------

export type TeamMember = {
  name: string;
  role: string;
  major: string;
  avatar: string;
};

export const STUDENTS: readonly TeamMember[] = [
  {
    name: "Shree Chaturvedi",
    role: "Strategy Consultant",
    major: "Computer Science, Mathematics",
    avatar: "/team/shree.jpeg",
  },
  {
    name: "Ayush Yadav",
    role: "Data Integration Intern",
    major: "Computer Science",
    avatar: "/team/ayush.jpeg",
  },
] as const;

// ---------------------------------------------------------------------------
// Advisors (verbatim from video/remotion/scenes/Slide/AcknowledgementsSlide.tsx:50-71)
// ---------------------------------------------------------------------------

export type Advisor = {
  name: string;
  role: string;
  avatar: string;
};

export const ADVISORS: readonly Advisor[] = [
  {
    name: "Samer Y. Khamaiseh, Ph.D.",
    role: "Technical Advisor",
    avatar: "/team/samer.png",
  },
  {
    name: "Prof. Lynn Stahr, M.S.",
    role: "CSE 449 Steward",
    avatar: "/team/stahr.png",
  },
] as const;

// ---------------------------------------------------------------------------
// Hero result numbers (video/config/benchmarks-content.ts)
// ---------------------------------------------------------------------------

export const HERO = {
  speedX: "7×",
  speedMinutesSaved: 116,
  methodLine: "N = 25 runs · 5 datasets · GPT-4o-mini · seed = 42",
  baselineCaption:
    "faster than manual Jupyter · 116 min saved per session",
} as const;

/** 5-dataset speed comparison — drops AutoGluon per the user's locked decision. */
export const SPEED_ROWS = [
  { dataset: "Titanic", rows: "891 rows", us: 2.8, jupyter: 18 },
  { dataset: "Ames Housing", rows: "1,460 × 79", us: 4.2, jupyter: 32 },
  { dataset: "Credit Card Fraud", rows: "284 K rows", us: 5.6, jupyter: 38 },
  { dataset: "Spaceship Titanic", rows: "8,693 rows", us: 3.8, jupyter: 26 },
  { dataset: "Adult Income", rows: "48 K rows", us: 3.2, jupyter: 22 },
] as const;

/** Guardrails. Plan asks for 5 representative rows; the sklearn asymmetry
 *  stays visible with 3 caught (us only), 1 caught (both), 2 missed (neither).
 */
export const GUARDRAIL_ROWS = [
  { id: "01", label: "Target leakage", us: true, sklearn: true },
  { id: "02", label: "Hidden missing values", us: true, sklearn: false },
  { id: "03", label: "Datetime as numeric", us: true, sklearn: false },
  { id: "04", label: "Row index as feature", us: true, sklearn: false },
  { id: "05", label: "Extreme outliers", us: false, sklearn: false },
] as const;

export const GUARDRAIL = {
  usTotal: 16,
  sklearnTotal: 3,
  max: 20,
  footnote: "10 seeded data flaws · 2 pts each · scored on tool intent",
} as const;

/** Quality — TOP 15% is the tightest honest framing that covers every dataset. */
export const QUALITY = {
  headline: "TOP 15% on every Kaggle benchmark",
  heroRank: 92,
  baselineRank: 50,
  footnote: "held-out test · 5 reps · 80/20 stratified · seed = 42",
} as const;

export const QUALITY_CELLS = [
  { dataset: "Titanic", value: ".812", tier: "TOP 8%" },
  { dataset: "Ames", value: ".122", tier: "TOP 12%" },
  { dataset: "Fraud", value: ".978", tier: "TOP 15%" },
  { dataset: "Spaceship", value: ".806", tier: "TOP 10%" },
  { dataset: "Adult", value: ".873", tier: "TOP 14%" },
] as const;

// ---------------------------------------------------------------------------
// Method — ledger counters (video/config/arch-content.ts:95-106)
// ---------------------------------------------------------------------------

export const LEDGER_CARDS = [
  { key: "workflow_runs", count: "1,247" },
  { key: "workflow_events", count: "18,403" },
  { key: "workflow_artifacts", count: "89" },
  { key: "workflow_approvals", count: "12" },
  { key: "workflow_handoffs", count: "34" },
  { key: "workflow_notebook_bindings", count: "421" },
] as const;

// ---------------------------------------------------------------------------
// Journey (video/config/journey-content.ts)
// ---------------------------------------------------------------------------

export const JOURNEY = {
  commits: 1989,
  issues: 324,
  mrs: 115,
  activeDays: 61,
  months: 11,
  loc: 462678,
  files: 2264,
  peakCallout: "+420 commits · week of Apr 5",
  totalsLine:
    "1,989 commits · 324 issues · 115 MRs · 61 active days · 11 months",
} as const;

/** 17 Sun-anchored weekly buckets (video/config/journey-content.ts:41-59). */
export const WEEKLY_BUCKETS = [
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
] as const;

export const MONTH_TICKS = [
  { label: "Dec", atWeek: 0 },
  { label: "Jan", atWeek: 2 },
  { label: "Feb", atWeek: 6 },
  { label: "Mar", atWeek: 10 },
  { label: "Apr", atWeek: 15 },
] as const;

// ---------------------------------------------------------------------------
// Problem (HookSlide activity ledger — video/remotion/scenes/Slide/HookSlide.tsx:104-111)
// ---------------------------------------------------------------------------

export const ACTIVITY_ROWS = [
  { label: "Data cleansing", pct: 26, hero: false },
  { label: "Data preparation", pct: 20, hero: false },
  { label: "Data visualization", pct: 14, hero: false },
  { label: "Model deployment", pct: 11, hero: false },
  { label: "Reporting / other", pct: 9, hero: false },
  { label: "Model training", pct: 20, hero: true },
] as const;

// ---------------------------------------------------------------------------
// Acknowledgements footer line (Instrument Serif italic 24pt)
// ---------------------------------------------------------------------------

export const ACKS = {
  body:
    "Built with OpenAI, Google Gemini, and Cursor. Datasets from Kaggle (Titanic, Ames, Credit Fraud, Spaceship, Adult). Problem data from Anaconda's 2022 State of Data Science survey (n = 3,493). CSE 449 Capstone, Miami University.",
} as const;
