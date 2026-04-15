import type { TimelineFixture } from "../types";

/**
 * Beat 1 — Landing Scroll.
 *
 * The product-demo opener. 60 s (3600 frames at 60 fps) total. The viewer
 * sees the settled landing page scroll past while voiceover narrates, with
 * 3 zoom moments highlighting brand details:
 *
 *   - Zoom #1: `.hero-agentically` — the metallic shimmer word
 *   - Zoom #2: first `.features-card` (01 CHAT) — proof of agentic chat
 *   - Zoom #3: giant AGENT wordmark in the footer
 *
 * Y-offset values below are APPROXIMATE (landing CSS-px from the top of
 * the document). Refine after first visual render — the LandingScreen
 * multiplies them by `COMP_WIDTH / 1440` to land them in composition space.
 */

export const LANDING_VOICEOVER = [
  "{{HERO}} Machine learning doesn't start with a notebook. It starts",
  "with a question you want answered. We built Agentic AutoML for",
  "everything in between: the setup, the cleanup, the tuning you",
  "didn't want to babysit. You describe the goal; the system does the",
  "rest, {{AGENTICALLY}}agentically.",
  "",
  "{{PREVIEW}} It runs as a workspace you already recognize — your",
  "data, your chat, a notebook watching every decision.",
  "",
  "{{PHASES}} Seven phases, each a real agent with a real plan.",
  "",
  "{{CHAT}} You steer it the way you'd steer a teammate. \"Drop the",
  "outliers.\" \"Try XGBoost.\" It answers in code, runs the code,",
  "writes down why.",
  "",
  "{{META}} All of it sandboxed in Docker, tuned with Optuna,",
  "orchestrated by a LangGraph state machine you can inspect.",
  "",
  "{{CLOSER}} A model in production. A notebook that explains itself.",
  "{{HANDOFF}} Here's what it looks like when a new user shows up.",
].join("\n");

export const LANDING_SCROLL: TimelineFixture = {
  id: "landing-scroll",
  events: [
    // Initial hold on hero.
    {
      id: "scroll-hero",
      start: { mark: "HERO" },
      kind: "scrollTo",
      payload: { y: 0 },
    },
    {
      id: "zoom-agentically",
      start: { mark: "AGENTICALLY" },
      kind: "zoom",
      payload: { target: "agentically" },
      durationFrames: 72,
    },
    {
      id: "sfx-shimmer-glint",
      start: { mark: "AGENTICALLY" },
      kind: "sfx",
      payload: { file: "shimmer-glint.mp3", volume: 0.5 },
    },

    // Scroll to app preview.
    {
      id: "scroll-preview",
      start: { mark: "PREVIEW" },
      kind: "scrollTo",
      payload: { y: 800 },
    },

    // Scroll to how-it-works.
    {
      id: "scroll-phases",
      start: { mark: "PHASES" },
      kind: "scrollTo",
      payload: { y: 1800 },
    },

    // Scroll to features + zoom on CHAT card.
    {
      id: "scroll-chat",
      start: { mark: "CHAT" },
      kind: "scrollTo",
      payload: { y: 2800 },
    },
    {
      id: "zoom-chat",
      start: { mark: "CHAT" },
      kind: "zoom",
      payload: { target: "chat-card" },
      durationFrames: 180,
    },

    // Scroll to meta cards.
    {
      id: "scroll-meta",
      start: { mark: "META" },
      kind: "scrollTo",
      payload: { y: 3800 },
    },

    // Scroll to footer + zoom on AGENT wordmark.
    {
      id: "scroll-closer",
      start: { mark: "CLOSER" },
      kind: "scrollTo",
      payload: { y: 4800 },
    },
    {
      id: "zoom-agent",
      start: { mark: "CLOSER" },
      kind: "zoom",
      payload: { target: "agent-wordmark" },
      durationFrames: 150,
    },
    {
      id: "sfx-whoosh-settle-agent",
      start: { after: "zoom-agent", offset: 0 },
      kind: "sfx",
      payload: { file: "whoosh-settle.mp3", volume: 0.5 },
    },

    // Handoff to Beat 2.
    {
      id: "sfx-whoosh-handoff",
      start: { mark: "HANDOFF" },
      kind: "sfx",
      payload: { file: "whoosh-forward.mp3", volume: 0.6 },
    },
  ],
} as const;
