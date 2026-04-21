/**
 * Booklet-specific copy.
 *
 * Canonical brand/institution/people strings come from the poster's content
 * module and are re-exported here unchanged so the three artifacts never
 * contradict each other. Booklet-specific narrative lives in the named
 * exports below.
 */

export {
  BRAND,
  INSTITUTION,
  STUDENTS,
  ADVISORS,
  HERO,
  SPEED_ROWS,
  GUARDRAIL_ROWS,
  GUARDRAIL,
  QUALITY,
  QUALITY_CELLS,
  LEDGER_CARDS,
  JOURNEY,
  WEEKLY_BUCKETS,
  MONTH_TICKS,
  ACTIVITY_ROWS,
  ACKS,
} from "../../poster/src/content";

// ---------------------------------------------------------------------------
// Abstract / endpaper (page 02) — ≤80 words, mirrors BRAND.subtitle voice.
// ---------------------------------------------------------------------------

export const ABSTRACT = {
  greeting: "Welcome.",
  body:
    "Agentic AutoML automates the 80% of machine-learning work that isn't training — cleaning, engineering, shipping. In our benchmarks it gets from a raw CSV to a deployed model 7× faster than manual Jupyter, while catching 16 of 20 synthetic data flaws (sklearn catches 3). This booklet walks the why, the how, what's inside, what we measured, and how we built it.",
} as const;

// ---------------------------------------------------------------------------
// Chapter TOC — colored swatches on page 03.
// ---------------------------------------------------------------------------

export const CHAPTERS = [
  { num: "01", name: "WHY",    pages: "04 – 07", sectionKey: "01_WHY"    as const },
  { num: "02", name: "HOW",    pages: "08 – 15", sectionKey: "02_HOW"    as const },
  { num: "03", name: "INSIDE", pages: "16 – 19", sectionKey: "03_INSIDE" as const },
  { num: "04", name: "PROOF",  pages: "20 – 22", sectionKey: "04_PROOF"  as const },
  { num: "05", name: "BUILD",  pages: "23 – 26", sectionKey: "05_BUILD"  as const },
] as const;

// ---------------------------------------------------------------------------
// Section 01 — WHY
// ---------------------------------------------------------------------------

export const WHY = {
  divider: {
    subtitle: "data science is mostly not data science",
  },
  eightyPercent: {
    pullQuote:
      "Data scientists spend 80% of their time on everything except training models.",
    body: [
      "Before a single `fit()` call, a practitioner has cleaned, merged, relabeled, visualized, sanity-checked, re-cleaned, prepped splits, and debugged feature pipelines. Training itself is a thin slice at the top of the stack.",
      "The same survey that gives us the 80% figure breaks the other 80 into six buckets: cleansing, prep, viz, deployment, reporting, and the glue between them. None of those tasks are the idea behind the model — they're the scaffolding around it.",
    ],
    // Serif coda — positioned lower on the page, above the second-cliff insight.
    coda:
      "The pattern has been stable for a decade. It's what makes 'doing data science' feel so different from 'learning data science.'",
    // Second key insight: even the models that DO get built rarely ship.
    // Source: VentureBeat, "Why do 87% of data science projects never make it
    // into production?" (Jul 19 2019) — quoting Deborah Leff, CTO Data Science
    // & AI at IBM, at Transform 2019, citing CIO Dive.
    // https://venturebeat.com/ai/why-do-87-of-data-science-projects-never-make-it-into-production
    secondCliff: {
      eyebrow: "The second cliff",
      figure: "87%",
      label: "of data science projects never reach production.",
      copy:
        "The 80% describes the work before `fit()`. The 87% describes what happens after. Only about one project in eight crosses the gap from notebook to deployed system — the rest stall on data access, integration, and the handoff between the people who built the model and the people who would run it.",
      // Two independent fencepost stats on one scale-of-100 bar, not a
      // compounding funnel — the percentages come from different studies and
      // populations.
      pipeline: [
        { stage: "started",   n: 100, note: "projects begun" },
        { stage: "reach fit()", n: 20, note: "80% lost to prep work" },
        { stage: "in production", n: 13, note: "87% never shipped" },
      ] as const,
      source: "source · VentureBeat 2019 · IBM / CIO Dive",
    },
  },
  whyNow: {
    eyebrows: [
      { id: "01", label: "models",    headline: "LLMs finally read tabular schemas well." },
      { id: "02", label: "protocols", headline: "MCP gives agents a durable tool contract." },
      { id: "03", label: "runtime",   headline: "Sandboxed Python is fast and safe enough now." },
    ],
    body: [
      "Models finally read tabular schemas with function calling, typed JSON, and reliable tool-call fidelity — a shift that only really landed with Claude 3.5 / GPT-4o in 2024, and that the GPT-5 series made production-grade in 2026.",
      "Protocols give agents a durable tool contract. MCP standardizes how an agent sees the product's capabilities, logs every call, and enforces allowlists per stage.",
      "Runtime is now fast and safe enough. Containerized Jupyter kernels start in under a second; a bad cell fails inside the sandbox instead of trashing the notebook.",
    ],
    sidebar: [
      "GPT-5.4: tool-call fidelity",
      "MCP registry: 20+ tools",
      "Docker: 2GB RAM · 1 CPU",
      "Jupyter Kernel Gateway: < 1s",
    ],
    // Timeline band — the causal counterfactual. Each row is one year's
    // missing ingredient, culminating in the 2026 unlock. The lead-in is a
    // single italic line that frames the table as an answer, not a list.
    timelineLead:
      "It could not have shipped earlier. Each year before 2026 was missing one of the three unlocks — or the reliability to trust them end-to-end.",
    timeline: [
      {
        year: "2020",
        unlock: "GPT-3 · raw capability",
        gap: "No function-calling, no JSON mode — agents could read schemas but could not safely act on them.",
      },
      {
        year: "2021",
        unlock: "LangChain 0.x · first agent loops",
        gap: "Prompt-chained tool use was brittle; one malformed string broke the entire chain.",
      },
      {
        year: "2022",
        unlock: "ChatGPT API · scaled access",
        gap: "Still free-text in, free-text out. Tabular schema reads were unreliable past ~10 columns.",
      },
      {
        year: "2023",
        unlock: "GPT-4 function calling · typed JSON",
        gap: "Tool contracts stabilized, but every vendor spoke a different dialect — no shared protocol.",
      },
      {
        year: "2024",
        unlock: "Claude 3.5 + MCP · protocol convergence",
        gap: "All three vendors aligned on MCP; tool-call fidelity past 95%, but agents still drifted past ~10 steps.",
      },
      {
        year: "2025",
        unlock: "GPT-5 preview + reasoning · deep tool graphs",
        gap: "Multi-step tool chains became reliable; agents could plan 20+ calls without losing the thread.",
      },
      {
        year: "2026",
        unlock: "GPT-5.4 · agentic AutoML becomes buildable",
        gap: "Schema-aware reasoning + sub-second sandboxes + a mature MCP ecosystem — the stack we're shipping.",
        isNow: true,
      },
    ],
  },
  whatChanged: {
    beforeTitle: "BEFORE",
    withTitle: "WITH AAMT",
    before: [
      "A 40-cell notebook, rewritten for every dataset.",
      "Copy-paste from Stack Overflow and past projects.",
      "Silent data flaws — dates parsed as integers, row indices treated as features.",
      "No record of what was tried, or why it was rejected.",
      "Deployment lives in a separate codebase the data scientist has never opened.",
    ],
    with: [
      "An agent plans the workflow in natural language, in your project's context.",
      "It writes the cells itself, citing the pandas / sklearn docs it used.",
      "16/20 guardrail score vs sklearn's 3/20 — we catch 8 of 10 seeded flaws to sklearn's partial 1.",
      "Every proposal, approval, and revision is captured as a durable run artifact.",
      "The champion model ships as a downloadable notebook and serving endpoint.",
    ],
    approvalGate:
      "Your call: which workflow do you want to be in?",
    failureModes: {
      eyebrow: "FAILURE MODES THAT DISAPPEARED",
      lede:
        "Five silent failures that kill a manual notebook — and the structural reason each one can't happen here.",
      rows: [
        {
          id: "01",
          failure: "Silent dtype coercion",
          oldSymptom:
            "ZIP codes load as int64 and lose their leading zero. A date column parsed as string still trains — just badly.",
          newSafeguard:
            "Schema inference runs before the first model; a guardrail flags the coercion and waits on approval.",
        },
        {
          id: "02",
          failure: "Kernel state drift",
          oldSymptom:
            "You re-run cell 12 after cell 30. The model still works. Six hours later nothing reproduces, and you can't say which cell lied.",
          newSafeguard:
            "Each phase runs in a fresh, checkpointed kernel. State is a function of the ledger, not the click order.",
        },
        {
          id: "03",
          failure: "Leakage through preview",
          oldSymptom:
            "A .head() on the full dataframe before the split. You've seen the test set, and every chart downstream is quietly poisoned.",
          newSafeguard:
            "EDA tools run split-aware by default. Test-partition statistics stay redacted until training completes.",
        },
        {
          id: "04",
          failure: "Lost provenance",
          oldSymptom:
            "A colleague asks why you dropped the age column. You scroll. You guess. The answer lives in a deleted Slack thread.",
          newSafeguard:
            "Every proposal, approval, and revision is a durable run artifact — queryable, diffable, exportable.",
        },
        {
          id: "05",
          failure: "Seed roulette",
          oldSymptom:
            "Two runs, same code, different leaderboard rank. You pick the luckier seed and call it a day.",
          newSafeguard:
            "Seeds are part of every tool spec; reruns are byte-identical unless you change the ledger on purpose.",
        },
      ],
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Section 02 — HOW
// ---------------------------------------------------------------------------

export const HOW = {
  divider: {
    subtitle: "talk to it · plan with it · own the notebook",
  },
  threePillars: [
    {
      eyebrow: "CHAT",
      headline: "Talk to your data like a colleague.",
      body:
        "Ask for a profile, a feature idea, or a model recommendation. The agent reads your dataset, drafts the cells, and explains its reasoning in the same pane.",
      outcome: "ask in English",
    },
    {
      eyebrow: "PLAN",
      headline: "Plan with it, not around it.",
      body:
        "Every multi-step task surfaces as a plan card — a numbered list of proposed cells. You approve, revise, or reject before anything runs.",
      outcome: "approve or revise",
    },
    {
      eyebrow: "NOTEBOOK",
      headline: "Own the notebook that ships.",
      body:
        "Approved cells land in a real Jupyter notebook you can edit, re-run, or download. There's no hidden agent state — the notebook is the record.",
      outcome: "edit and ship",
    },
  ],
  phases: [
    {
      num: "01",
      name: "Upload & Ingest",
      purpose:
        "Drop a CSV or pull from Postgres, name the project, pick a theme.",
      slug: "phase-01-upload",
      placeholderDescription:
        "Upload area showing drag-drop zone, file preview card, and the project theme-color picker visible in the upper-right.",
      callouts: [
        { label: "CSV · JSON · XLSX up to 300 MB.",                            side: "left"  },
        { label: "Profile samples 20 rows before Postgres commits.",           side: "right" },
        { label: "Theme color propagates to every visible surface.",           side: "right" },
      ],
      stats: [
        { label: "UPLOAD MAX",    value: "300 MB"            },
        { label: "FORMATS",       value: "CSV · JSON · XLSX" },
        { label: "DTYPES SNIFFED", value: "6 canonical"       },
      ],
      toolCall: {
        tool: "get_dataset_profile",
        args: { datasetId: "ds_8af2", sample: 20 },
        note: "first call on every new ingest — primes the planner's schema cache.",
      },
      inlineNote:
        "A fresh upload writes a `projects.json` entry, a Postgres row, and a theme token. Everything else keys off that triple.",
      handoff: "Ingested. Continue to Explore →",
    },
    {
      num: "02",
      name: "Explore",
      purpose:
        "Browse schema, inspect distributions, and run natural-language SQL.",
      slug: "phase-02-explore",
      placeholderDescription:
        "Data Viewer tab: schema panel on the left, sample-rows table center, and the NL→SQL query box at the top with an example query in flight.",
      callouts: [
        { label: "Schema panel folds/unfolds by column family.",           side: "left"  },
        { label: "NL→SQL box compiles to real SQL you can copy.",          side: "right" },
        { label: "Two-pass planner: plan JSON, then read-only SELECT.",    side: "right" },
      ],
      stats: [
        { label: "QUERY CACHE",    value: "40 ms p50"      },
        { label: "SAMPLE SHAPE",   value: "2,530 × 14"     },
        { label: "PLANNER",        value: "two-pass JSON"  },
      ],
      toolCall: {
        tool: "nl_to_sql",
        args: {
          prompt: "rows where age > 60 and cholesterol > 240",
          datasetId: "ds_8af2",
        },
        note: "compiles to read-only SELECT; copy-to-clipboard always available.",
      },
      inlineNote:
        "Every NL query is cached on its AST hash; a second ask returns in under a frame.",
      handoff: "Mapped. Continue to Preprocess →",
    },
    {
      num: "03",
      name: "Preprocess",
      purpose:
        "Agent proposes transforms; you approve, revise, or reject each one.",
      slug: "phase-03-preprocess",
      placeholderDescription:
        "Preprocessing panel mid-flow: the agent's proposed transformation step on the left, a diff preview center, Approve / Revise buttons bottom-right. The LangGraph approval gate is the focal point.",
      callouts: [
        { label: "Each step is a reviewable diff, not a black box.",       side: "left"  },
        { label: "Approval gate pauses the FSM until you decide.",         side: "right" },
        { label: "Auto-repair retries twice before handing back to the planner.", side: "left" },
      ],
      stats: [
        { label: "AUTO-REPAIR",   value: "2 retries"       },
        { label: "ON FAILURE",    value: "escalate to planner" },
        { label: "APPROVAL MODE", value: "human-in-loop"   },
      ],
      toolCall: {
        tool: "request_approval",
        args: {
          stage: "commit",
          diff: "impute_median(cholesterol)",
          reason: "12.4% missing",
        },
        note: "FSM halts at stage 6 (await_approval) until a decision posts back.",
      },
      inlineNote:
        "Where AutoML hides the decision, we surface it — every transform is a diff you either approve or revise.",
      handoff: "Cleaned. Continue to Features →",
    },
    {
      num: "04",
      name: "Features",
      purpose:
        "Build features via the query UI or accept auto-generated candidates.",
      slug: "phase-04-features",
      placeholderDescription:
        "Feature Engineering panel: query builder UI at the top, auto-candidate generator results center, accept / reject controls right.",
      callouts: [
        { label: "Query builder is a first-class UI, not a prompt hack.",        side: "left"  },
        { label: "Agent proposes 3-5 diverse candidates per turn.",              side: "right" },
        { label: "Each tagged high · med · low impact; accept individually or in bulk.", side: "right" },
      ],
      stats: [
        { label: "METHOD CATALOG", value: "33 techniques"    },
        { label: "PER TURN",       value: "3–5 proposals"    },
        { label: "IMPACT TAGS",    value: "high · med · low" },
      ],
      toolCall: {
        tool: "target_encode",
        args: {
          column: "chest_pain_type",
          target: "heart_disease",
          smoothing: 10,
        },
        note: "one of 33 catalog entries — reviewable before it lands in the notebook.",
      },
      inlineNote:
        "Accept in bulk to race the notebook forward, or triage individually — same code path either way.",
      handoff: "Engineered. Continue to Train →",
    },
    {
      num: "05",
      name: "Train",
      purpose:
        "Approve the training plan, watch the agent's reasoning stream.",
      slug: "phase-05-train",
      placeholderDescription:
        "Training panel with the approval-gate modal pre-execution: model recommendation card, training plan, agentic shell sidebar with the reasoning stream.",
      callouts: [
        { label: "Default is GradientBoosting via sklearn.ensemble.",        side: "left"  },
        { label: "Lifecycle has two user gates: plan, then pre-fit review.", side: "right" },
        { label: "Reasoning stream stays audited after the run.",            side: "right" },
      ],
      stats: [
        { label: "LIFECYCLE",     value: "10 stages"          },
        { label: "USER GATES",    value: "plan · pre-fit"     },
        { label: "DEFAULT MODEL", value: "GradientBoosting"   },
      ],
      toolCall: {
        tool: "propose_plan",
        args: {
          task: "binary_classification",
          model: "GradientBoostingClassifier",
          cv: "stratified-5fold",
        },
        note: "plan card posts to the UI; run-notebook only fires after the second gate.",
      },
      inlineNote:
        "The reasoning stream stays after the run — every decision is auditable post-hoc.",
      handoff: "Trained. Continue to Experiments →",
    },
    {
      num: "06",
      name: "Experiments",
      purpose:
        "Leaderboard with champion highlighted; compare runs side-by-side.",
      slug: "phase-06-experiments",
      placeholderDescription:
        "Experiments dashboard leaderboard with the champion model highlighted and a side-by-side comparison view open.",
      callouts: [
        { label: "Welch's t-test compares model variants.",             side: "left"  },
        { label: "Leaderboard surfaces top-3; champion row always pinned.", side: "right" },
        { label: "Download notebook + serving endpoint per run.",       side: "right" },
      ],
      stats: [
        { label: "BENCHMARK SET", value: "5 datasets"     },
        { label: "SIGNIFICANCE",  value: "Welch's t-test" },
        { label: "LEADERBOARD",   value: "top-3 + champion" },
      ],
      toolCall: {
        tool: "leaderboard.snapshot",
        args: {
          datasetId: "ds_8af2",
          metric: "roc_auc",
          topN: 3,
        },
        note: "champion row is pinned; downloadable notebook + endpoint per entry.",
      },
      inlineNote:
        "Two runs on the same data with different seeds? Welch's keeps the leaderboard honest.",
      handoff: "Shipped. Now look under the hood →",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Section 03 — INSIDE
// ---------------------------------------------------------------------------

export const INSIDE = {
  divider: {
    subtitle: "the engine room",
  },
  preprocessingFsm: {
    headline: "The preprocessing FSM.",
    body:
      "Preprocessing is an 8-stage LangGraph state machine. Each stage is a typed node with an input contract and an explicit successor set. The approval gate lives at stage 6 — the FSM pauses until the user commits or revises. Auto-repair is a bounded retry loop; after two failed attempts, control returns to the planner.",
    stages: [
      { id: "context",        label: "context"        },
      { id: "plan",           label: "plan"           },
      { id: "generate",       label: "generate"       },
      { id: "execute",        label: "execute"        },
      { id: "validate",       label: "validate"       },
      { id: "await_approval", label: "await approval" },
      { id: "commit",         label: "commit / revise"},
      { id: "complete",       label: "complete"       },
    ],
  },
  mcpRegistry: {
    headline: "The MCP tool registry.",
    body:
      "20+ tools expose the product to the agent through the Model Context Protocol. Five see the most use: get_dataset_profile (inspect), edit_cell (transform), run_notebook_cell (execute), propose_plan (plan), and request_approval (gate). Every call is logged against the run.",
    tools: [
      { name: "get_dataset_profile", category: "inspect"   },
      { name: "describe_column",     category: "inspect"   },
      { name: "sample_rows",         category: "inspect"   },
      { name: "read_cell",           category: "inspect"   },
      { name: "search_docs",         category: "search"    },
      { name: "search_notebook",     category: "search"    },
      { name: "edit_cell",           category: "transform" },
      { name: "append_cell",         category: "transform" },
      { name: "delete_cell",         category: "transform" },
      { name: "rename_column",       category: "transform" },
      { name: "drop_column",         category: "transform" },
      { name: "cast_dtype",          category: "transform" },
      { name: "run_notebook_cell",   category: "execute"   },
      { name: "kernel_status",       category: "execute"   },
      { name: "propose_plan",        category: "plan"      },
      { name: "request_approval",    category: "plan"      },
      { name: "validate_schema",     category: "validate"  },
      { name: "validate_types",      category: "validate"  },
      { name: "detect_leakage",      category: "validate"  },
      { name: "profile_splits",      category: "validate"  },
    ],
  },
  sandbox: {
    headline: "Sandbox & kernel.",
    body:
      "Every cell runs inside a Docker container with hard limits: 2GB RAM, 1 CPU, non-root user, read-only root filesystem. A Jupyter Kernel Gateway is the only channel into the container; the gateway's REST surface is the agent's sole execution path. If the container dies, the run fails cleanly — nothing is left behind.",
    limits: [
      { label: "memory",       value: "2GB"                },
      { label: "cpu",          value: "1 core"             },
      { label: "user",         value: "non-root"           },
      { label: "root fs",      value: "read-only"          },
      { label: "network",      value: "egress-allowlisted" },
      { label: "cold-start",   value: "< 1s"               },
    ],
    approvalGate:
      "Every cell of generated code is yours to read, edit, or reject before it executes.",
  },
} as const;

// ---------------------------------------------------------------------------
// Section 04 — PROOF
// ---------------------------------------------------------------------------

export const PROOF = {
  divider: {
    subtitle: "what we measured · how it landed",
  },
  speed: {
    heroNumber: "7×",
    heroCaption: "faster than manual Jupyter",
    method: "N = 25 runs · 5 datasets · GPT-4o-mini · seed = 42",
    pullQuote: "Enough time to test three more feature ideas — per session.",
  },
  quality: {
    headline: "TOP 15%",
    caption: "on every Kaggle leaderboard",
    method: "held-out test · 5 reps · 80/20 stratified · seed = 42",
  },
  guardrails: {
    headline: "16 / 20 caught",
    caption: "16 points / 20 possible · 8 of 10 flaws caught, weighted.",
    method: "10 seeded flaws · 2 pts each · scored on tool intent",
  },
} as const;

// ---------------------------------------------------------------------------
// Limitations — what we don't do yet. Surfaced on a PROOF page (Agent 5 places).
// ---------------------------------------------------------------------------

export const LIMITATIONS = {
  body: "What we don't do yet: deep-learning pipelines aren't supported; multi-table schemas are treated one-table-at-a-time; the agent over-indexes on top-3 Kaggle patterns. These are the next three sprints.",
} as const;

// ---------------------------------------------------------------------------
// Guardrail row detail — per-flaw editorial enrichment for page 22. Keyed by
// GUARDRAIL_ROWS[i].id so the visual can join without inventing shadow data.
// `validator` names the check family (schema / statistical / type-coerce /
// domain-rule) and `catchNote` is the 2–6-word mono subtitle that tells the
// reader *how* we caught it — not just *whether*.
// ---------------------------------------------------------------------------

export const GUARDRAIL_DETAIL: Record<
  string,
  { validator: string; catchNote: string }
> = {
  "01": { validator: "statistical", catchNote: "flagged · target MI > 0.98" },
  "02": { validator: "schema",      catchNote: "sentinel '-999' detected"    },
  "03": { validator: "type-coerce", catchNote: "parsed · 94% to datetime"    },
  "04": { validator: "domain-rule", catchNote: "blocked · monotonic column"  },
  "05": { validator: "statistical", catchNote: "tolerated · flags on request" },
} as const;

/** Sklearn-nuance callout — explains the single partial catch that lifts
 *  sklearn from 2/20 (naive row count) to 3/20 (weighted). Keeps the
 *  competitive claim honest rather than inflated. */
export const GUARDRAIL_NUANCE = {
  eyebrow: "SKLEARN · PARTIAL CREDIT",
  body: "Sklearn's SimpleImputer silently fills NaNs — helpful, but it never warns when the 'missingness' itself was the signal. We score that as a half-catch (+1pt), which is why sklearn lands at 3/20, not 2/20.",
} as const;

// ---------------------------------------------------------------------------
// Section 05 — BUILD
// ---------------------------------------------------------------------------

export const BUILD = {
  divider: {
    subtitle: "eleven months · two engineers · 1,989 commits",
  },
  sprints: [
    {
      num: "S6",
      dateRange: "Dec 21 – Jan 24",
      milestones: [
        "Project skeleton: backend · frontend · Postgres.",
        "First upload → explore loop.",
        "Seeded the `projects.json` store.",
      ],
      author: "Shree + Ayush",
    },
    {
      num: "S7",
      dateRange: "Jan 25 – Feb 21",
      milestones: [
        "LangGraph FSM wired end-to-end.",
        "MCP tool registry, 12 tools at launch.",
        "First approval gate shipped.",
      ],
      author: "Shree + Ayush",
    },
    {
      num: "S8",
      dateRange: "Feb 22 – Mar 21",
      milestones: [
        "Solo sprint: 205 commits.",
        "Training panel + experiments dashboard.",
        "Benchmark harness: 5 datasets · 25 runs.",
      ],
      author: "Shree",
    },
    {
      num: "S9",
      dateRange: "Mar 22 – Apr 20",
      milestones: [
        "Peak week: +420 commits (Apr 5).",
        "Landing site + poster + booklet.",
        "Kaggle benchmark: TOP 15% on every leaderboard.",
      ],
      author: "Shree + Ayush",
    },
  ],
  pullQuotes: {
    left:  "Brain and body. We split the system in half.",
    right: "Sprint 8 was solo: 205 commits.",
  },
} as const;

// ---------------------------------------------------------------------------
// Team (page 26) — each student's owned subsystems.
// ---------------------------------------------------------------------------

export const TEAM_PAGE = {
  shree: {
    name: "Shree Chaturvedi",
    role: "Strategy Consultant · CS + Math",
    owned: [
      "01 · agent orchestration (LangGraph)",
      "02 · MCP tool registry",
      "03 · frontend experience layer",
    ],
  },
  ayush: {
    name: "Ayush Yadav",
    role: "Data Integration Intern · CS",
    owned: [
      "01 · preprocessing pipeline",
      "02 · sandbox + kernel gateway",
      "03 · dataset ingestion",
    ],
  },
  spineQuote: "Brain and body. We split the system in half.",
  acks: "Thanks to Dr. Khamaiseh (technical advisor) and Prof. Stahr (CSE 449 steward).",
  builtOn: "Built on LangGraph, Jupyter Kernel Gateway, scikit-learn, and pandas.",
} as const;

// ---------------------------------------------------------------------------
// Closing (page 27) — mirrors the video's ClosingSlide.
// ---------------------------------------------------------------------------

export const CLOSING = {
  tagline: "From dataset to deployed models, agentically and autonomously.",
  liveLabel: "LIVE DEMO",
  liveUrl: "agentic-automl.vercel.app",
  repoLabel: "REPO",
  repoUrl: "agentic-automl.vercel.app/repo",
  leftArrowLabel: "try it",
  rightArrowLabel: "read it",
} as const;
