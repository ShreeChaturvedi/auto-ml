/**
 * Editorial copy for the AI Collaboration (Slide 5) and Retrospective trio
 * (Slides 6-8). All statements are ready to paste verbatim — the `emphasis`
 * substring on each retro statement is the phrase the tone-colored
 * FlourishUnderline draws beneath.
 */

export const AI_COLLAB = {
  eyebrow: "AI COLLABORATION",
  title: "The AI collaborators that made this ship.",
  flourishTarget: "collaborators",
  cards: [
    {
      icon: "openai" as const,
      eyebrow: "ENGINE INTEGRATION",
      title: "OpenAI API",
      copy:
        "Wired into /api/llm — NL-to-SQL, LangGraph preprocessing, RAG retrieval, and the eval harness all route through one client.",
      chip: "backend/services/llm",
      hero: false,
    },
    {
      icon: "gemini" as const,
      eyebrow: "FRONT-END PAIR PROGRAMMING",
      title: "Google Gemini",
      copy:
        "Paired on frontend design decisions and debugged backend logic too complex for one pass. Opinions cheap, fresh eyes invaluable.",
      chip: "frontend/components",
      hero: true,
    },
    {
      icon: "cursor" as const,
      eyebrow: "ISSUE TRIAGE",
      title: "Cursor",
      copy:
        "Drafted GitLab issues, reviewed MRs, triaged the sprint backlog. 324 issues closed across eleven sprints.",
      chip: "gitlab.csi.miamioh.edu",
      hero: false,
    },
  ],
  tape: [
    { id: "openai", label: "openai.chat.completions", color: "#1D4ED8", enterFrame: 300 },
    { id: "gemini", label: "gemini.generate_content", color: "#8B5CF6", enterFrame: 340 },
    { id: "cursor", label: "cursor.mr.review", color: "#F59E0B", enterFrame: 380 },
  ],
  methodStrip: "eleven sprints · 324 issues · one engine",
} as const;

export type RetroTone = "blue" | "green" | "amber";

export type RetroStatement = {
  /** Full statement body rendered serif-italic on the slide. */
  body: string;
  /** Substring of `body` the tone-colored flourish draws beneath. Must be
   *  literally present inside `body` (slide components split on it). */
  emphasis: string;
};

export type RetroAnchor = "none" | "graph" | "toolcall";

export type RetroSlideConfig = {
  id: "learned" | "wentWell" | "differently";
  eyebrow: string;
  title: string;
  tone: RetroTone;
  statements: readonly RetroStatement[];
  anchor: RetroAnchor;
};

export const RETRO: Record<"learned" | "wentWell" | "differently", RetroSlideConfig> = {
  learned: {
    id: "learned",
    eyebrow: "RETROSPECTIVE · 01 / 03",
    title: "LEARNED",
    tone: "blue",
    statements: [
      {
        body:
          "LangGraph's explicit state machine outperformed chained prompts once we needed pause/resume semantics.",
        emphasis: "pause/resume semantics",
      },
      {
        body:
          "NL-to-SQL plateaus without domain RAG — the schema retriever carried more weight than prompt engineering.",
        emphasis: "the schema retriever",
      },
      {
        body:
          "Eval harnesses are infrastructure, not tooling. Ours belonged in sprint 1, not sprint 7.",
        emphasis: "infrastructure, not tooling",
      },
    ],
    anchor: "none",
  },
  wentWell: {
    id: "wentWell",
    eyebrow: "RETROSPECTIVE · 02 / 03",
    title: "WHAT WENT WELL",
    tone: "green",
    statements: [
      {
        body:
          "Playwright caught three regressions before human QA ever saw them.",
        emphasis: "three regressions",
      },
      {
        body:
          "Tool calling gave the LLM eyes and hands — and LangGraph turned improvisation into a structured workflow.",
        emphasis: "a structured workflow",
      },
    ],
    anchor: "graph",
  },
  differently: {
    id: "differently",
    eyebrow: "RETROSPECTIVE · 03 / 03",
    title: "WHAT WE'D DO DIFFERENTLY",
    tone: "amber",
    statements: [
      {
        body:
          "We'd start with LangGraph. We spent nine months hand-rolling agent orchestration before the state machine was bolted on in sprint 7.",
        emphasis: "nine months",
      },
      {
        body:
          "We'd ship an end-to-end MVP shell first. Strict phase-by-phase shipping meant no one could feel the whole product until sprint 9.",
        emphasis: "end-to-end MVP shell",
      },
    ],
    anchor: "toolcall",
  },
};

/** ToolCallCard body used by Slide 8's right-rail anchor. */
export const DIFFERENTLY_TOOLCALL = {
  title: 'graph.create(',
  body: [
    "  state:     SprintState,",
    "  entrypoint: 'upload',",
    "  nodes:     ['explore','train','deploy'],",
    "  mvp_shell:  true,",
  ],
  footer: ")",
} as const;

/** Slide 7 agent-column anchor — 3 nodes, 2 edges. */
export const WENT_WELL_GRAPH = {
  nodes: [
    { label: "propose", y: 0 },
    { label: "tool_call", y: 180 },
    { label: "validate", y: 360 },
  ],
  edges: [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
  ],
} as const;
