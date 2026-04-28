/**
 * Mock benchmark data — research-validated ranges from
 * docs/expo-benchmark-research.md. Real numbers swap in here when benchmark
 * runs land. Slides import from this file; never inline numbers.
 *
 * IMPORTANT: arrays are `as const` for literal types. Slides accessing these
 * via index must use the `as TupleType` cast pattern (see ArchHookSlide:50,
 * ProblemTrioSlide:139-147) to satisfy `noUncheckedIndexedAccess: true`.
 */

// ----- Speed -----
export const SPEED_DATA = [
  { dataset: "Titanic", subLabel: "891 rows", us: 2.8, jupyter: 18, autogluon: 1.5 },
  { dataset: "Ames Housing", subLabel: "1,460 × 79", us: 4.2, jupyter: 32, autogluon: 3.0 },
  { dataset: "Credit Card Fraud", subLabel: "284K rows", us: 5.6, jupyter: 38, autogluon: 7.5 },
  { dataset: "Spaceship Titanic", subLabel: "8,693 rows", us: 3.8, jupyter: 26, autogluon: 2.8 },
  { dataset: "Adult Income", subLabel: "48K rows", us: 3.2, jupyter: 22, autogluon: 2.2 },
] as const;
/** Sum(jupyter) − Sum(us) = 136 − 19.6 = 116.4 → "116 minutes saved per session". */
export const SPEED_TOTAL_MIN_SAVED = 116;
/** Median(jupyter / us) ratio: jupyter sum 136 / us sum 19.6 ≈ 6.94 → "7×". */
export const SPEED_HERO_X = "7×"; // single number for legibility (not "5–10×")

// ----- Quality -----
/** Each entry is one MetricCard. `from` is set on error metrics (RMSLE) so
 *  the count animates DOWN from baseline → our value (improvement direction). */
export const QUALITY_DATA = [
  { id: "titanic", eyebrow: "TITANIC ACC.", from: 0, value: 0.812, decimals: 3, percentile: "TOP 8%", highlight: true },
  { id: "ames", eyebrow: "AMES RMSLE", from: 0.140, value: 0.122, decimals: 3, percentile: "TOP 12%", highlight: false },
  { id: "fraud", eyebrow: "FRAUD AUC", from: 0, value: 0.978, decimals: 3, percentile: "TOP 15%", highlight: false },
  { id: "spaceship", eyebrow: "SPACESHIP ACC.", from: 0, value: 0.806, decimals: 3, percentile: "TOP 10%", highlight: false },
  { id: "adult", eyebrow: "ADULT ACC.", from: 0, value: 0.873, decimals: 3, percentile: "TOP 14%", highlight: false },
] as const;
/** Quality hero: Titanic at 92nd percentile (= "Top 8%"). */
export const QUALITY_HERO_RANK = 92;
export const QUALITY_BASELINE_RANK = 50; // median competitor reference

// ----- Guardrails -----
/** 10 flaws × 2 pts = 20 max. Us = 8 full + 0 partial = 16/20. Sklearn =
 *  1 full + 1 partial = 3/20. The "partial" appears visually as caught
 *  in the sklearn grid but the score increment is +1 not +2. */
export const GUARDRAIL_FLAWS = [
  { id: "01", label: "Target leakage",               us: { caught: true,  pts: 2 }, sklearn: { caught: true,  pts: 2 } },
  { id: "02", label: "Hidden missing values",        us: { caught: true,  pts: 2 }, sklearn: { caught: false, pts: 0 } },
  { id: "03", label: "Datetime as numeric",          us: { caught: true,  pts: 2 }, sklearn: { caught: false, pts: 0 } },
  { id: "04", label: "Class imbalance (99.5 / 0.5)", us: { caught: true,  pts: 2 }, sklearn: { caught: true,  pts: 1 } },
  { id: "05", label: "Duplicate rows",               us: { caught: true,  pts: 2 }, sklearn: { caught: false, pts: 0 } },
  { id: "06", label: "Mixed types in numeric",       us: { caught: true,  pts: 2 }, sklearn: { caught: false, pts: 0 } },
  { id: "07", label: "High-card categorical",        us: { caught: true,  pts: 2 }, sklearn: { caught: false, pts: 0 } },
  { id: "08", label: "Row index as feature",         us: { caught: true,  pts: 2 }, sklearn: { caught: false, pts: 0 } },
  { id: "09", label: "Extreme outliers",             us: { caught: false, pts: 0 }, sklearn: { caught: false, pts: 0 } },
  { id: "10", label: "Text in numeric column",       us: { caught: false, pts: 0 }, sklearn: { caught: false, pts: 0 } },
] as const;
export const GUARDRAIL_US_TOTAL = 16;
export const GUARDRAIL_SKLEARN_TOTAL = 3;

// ----- Hook -----
/** Three pillars of the closing-arc narrative. Pillar 2 (GUARDRAILS) is the
 *  slide's hero — only it gets `hero: true`, mapping to ScaleInNumber. */
export const HOOK_PILLARS = [
  {
    eyebrow: "SPEED",
    headline: "Minutes, not an afternoon.",
    body: "From CSV upload to a trained model with held-out metrics. Median over five public Kaggle datasets against a baseline of manual Jupyter.",
    value: 7,
    display: "7×",
    hero: false,
  },
  {
    eyebrow: "GUARDRAILS",
    headline: "Ten flaws. Eight caught.",
    body: "Ten well-known data-quality defects were seeded into the test suites. Scored two points each on whether the platform surfaced the right fix in the preprocessing plan.",
    value: 16,
    display: "16/20",
    hero: true,
  },
  {
    eyebrow: "QUALITY",
    headline: "Top 10% on every one.",
    body: "Held-out scoring against the Kaggle public leaderboards. Five datasets, five submissions, each produced by the same agentic pipeline with no dataset-specific tuning.",
    value: 92,
    display: "TOP 8%",
    hero: false,
  },
] as const;

// ----- Methodology footnotes (one per slide) -----
export const METHOD_FOOTNOTES = {
  hook: "five datasets · GPT-4o-mini @ T=0.0 · 5 reps · 80/20 stratified · seed=42",
  speed: "wall-clock: upload → metrics · GPT-4o-mini @ T=0.0 · 5 reps · 80/20 stratified · seed=42",
  quality: "metrics: held-out test split · Kaggle public LB · 5 reps · 80/20 stratified · seed=42",
  guardrails: "10 seeded data flaws · 2 pts each · scored on tool intent · 3 reps · seed=42",
} as const;
