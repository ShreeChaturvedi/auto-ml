import type { z } from "zod";
import type { SelectableScene, slideScene } from "./scenes";

/**
 * Scene manifest for the main video composition.
 *
 * Exports:
 * - `SLIDE_SCENES`: the narrative slide runway (used by both the MP4 build
 *   and the presenter web deck). Keeping slide entries in a separate export
 *   lets Vite tree-shake the demo-scene data out of the presenter bundle —
 *   demo string literals like `"signup.webm"` never make it to browser JS.
 * - `DEMO_SCENES`: the urlIntro + pre-rendered demo captures woven between
 *   `agenda` and `tech-stack` in the MP4. Presenter mode excludes this
 *   export by design.
 * - `DEFAULT_SCENES`: the full ordered composition used by `Root.tsx`.
 * - `DEFAULT_CHAPTERS`: chapter list for `AgendaSlide.meta.chapters`.
 */

type SlideSceneType = z.infer<typeof slideScene>;

/**
 * Default chapter list for `AgendaSlide`. Read from `scene.meta.chapters` —
 * the slide parses them at runtime with a type-guard so a malformed payload
 * falls back to its own internal copy.
 *
 * `as const` preserves literal types + `readonly` — `meta` is typed as
 * `Record<string, unknown>` so the payload is widened at the boundary.
 */
export const DEFAULT_CHAPTERS = [
  { title: "Upload & Project Planning", timestamp: "TBD" },
  { title: "Data Exploration — EDA + Natural-Language SQL", timestamp: "TBD" },
  {
    title: "Preprocessing — the LangGraph finite state machine",
    timestamp: "TBD",
    accent: true,
  },
  { title: "Feature Engineering", timestamp: "TBD" },
  { title: "Training — sandboxed Docker notebooks", timestamp: "TBD" },
  { title: "Experiments & Leaderboard", timestamp: "TBD" },
  { title: "What's Next", timestamp: "TBD" },
  {
    title: "Architecture — one graph, three phases",
    timestamp: "TBD",
  },
] as const;

/**
 * All slide entries in narrative order — the runway the presenter talks
 * over. Each slide declares a `voiceoverFile` so the MP3 length wins over
 * `durationInFrames` at calcMetadata time. The fallback frame counts are
 * kept as design budgets: they describe what the slide WANTS for full
 * visual hold; the audio may come in slightly under and trim the trailing
 * hold (acceptable). The `closing` slide intentionally has NO voiceover so
 * its 13.5 s bookend animation can complete in silence.
 */
export const SLIDE_SCENES: SlideSceneType[] = [
  // === Opening movement — narration drives duration via calcMetadata ===
  {
    type: "slide",
    id: "title",
    voiceoverFile: "title.mp3",
    durationInFrames: 540,
  },
  {
    type: "slide",
    id: "hook",
    voiceoverFile: "hook.mp3",
    durationInFrames: 720,
  },
  {
    type: "slide",
    id: "team",
    voiceoverFile: "team.mp3",
    durationInFrames: 840,
  },
  {
    type: "slide",
    id: "acknowledgements",
    voiceoverFile: "acknowledgements.mp3",
    durationInFrames: 780,
  },
  {
    type: "slide",
    id: "problem-trio",
    voiceoverFile: "problem-trio.mp3",
    durationInFrames: 2040,
  },
  {
    type: "slide",
    id: "why-now",
    voiceoverFile: "why-now.mp3",
    durationInFrames: 1440,
  },
  {
    type: "slide",
    id: "agenda",
    voiceoverFile: "agenda.mp3",
    durationInFrames: 1620,
    meta: { chapters: DEFAULT_CHAPTERS },
  },

  // === Tech stack — deterministic shell around a probabilistic core ===
  // Closes the argumentative arc: ledger row per layer (experience →
  // orchestration → intelligence → execution), each paired with its
  // machine-verifiable receipt, then lifts away for a centered serif closer.
  {
    type: "slide",
    id: "tech-stack",
    voiceoverFile: "tech-stack.mp3",
    durationInFrames: 900,
  },

  // === Architecture section — how the agent actually runs ===
  // 8 slide entries (6 narrative scenes; Scene 4 splits into -a, approval
  // silent beat, and -b so the pause produces true silence without VO
  // script trickery). calc-metadata auto-overrides durationInFrames with
  // the MP3 length when the audio files exist; the silent beat intentionally
  // omits voiceoverFile.
  {
    type: "slide",
    id: "arch-hook",
    voiceoverFile: "arch-hook.mp3",
    durationInFrames: 1080,
  },
  {
    type: "slide",
    id: "arch-engine",
    voiceoverFile: "arch-engine.mp3",
    durationInFrames: 1920,
  },
  {
    type: "slide",
    id: "arch-phase-adapter",
    voiceoverFile: "arch-phase-adapter.mp3",
    durationInFrames: 1320,
  },
  {
    type: "slide",
    id: "arch-training-propose-a",
    voiceoverFile: "arch-training-propose-a.mp3",
    durationInFrames: 900,
  },
  // SILENT beat — no voiceoverFile by design. `SceneVoiceover` renders
  // nothing when the field is missing, so the slide plays dead-silent.
  {
    type: "slide",
    id: "arch-training-propose-approval",
    durationInFrames: 240,
  },
  {
    type: "slide",
    id: "arch-training-propose-b",
    voiceoverFile: "arch-training-propose-b.mp3",
    durationInFrames: 600,
  },
  {
    type: "slide",
    id: "arch-training-execute-cascade",
    voiceoverFile: "arch-training-execute-cascade.mp3",
    durationInFrames: 4320,
  },
  {
    type: "slide",
    id: "arch-pullback",
    voiceoverFile: "arch-pullback.mp3",
    durationInFrames: 2760,
  },

  // === Benchmarks — proof of the three claims (closing crescendo) ===
  // 4 slides, ~71s combined. calc-metadata auto-extends each slide's
  // duration to the MP3 length once the voiceover renders.
  {
    type: "slide",
    id: "benchmarks-hook",
    voiceoverFile: "benchmarks-hook.mp3",
    durationInFrames: 900,
  },
  {
    type: "slide",
    id: "benchmarks-speed",
    voiceoverFile: "benchmarks-speed.mp3",
    durationInFrames: 1080,
  },
  {
    type: "slide",
    id: "benchmarks-quality",
    voiceoverFile: "benchmarks-quality.mp3",
    durationInFrames: 1080,
  },
  {
    type: "slide",
    id: "benchmarks-guardrails",
    voiceoverFile: "benchmarks-guardrails.mp3",
    durationInFrames: 1200,
  },

  // === Journey — 11 months of commits in 34 seconds ===
  // Four slides bridging Benchmarks → Closing. Pulse (600 f) is the section
  // headliner; three sprint-range breakdowns share a JourneyHeader pill that
  // translates + recolors across scene boundaries so the reader perceives
  // them as one camera pan across the year. MP3 length wins via calcMetadata.
  {
    type: "slide",
    id: "journey-pulse",
    voiceoverFile: "journey-pulse.mp3",
    durationInFrames: 600,
  },
  {
    type: "slide",
    id: "journey-foundation",
    voiceoverFile: "journey-foundation.mp3",
    durationInFrames: 480,
  },
  {
    type: "slide",
    id: "journey-agentic",
    voiceoverFile: "journey-agentic.mp3",
    durationInFrames: 480,
  },
  {
    type: "slide",
    id: "journey-production",
    voiceoverFile: "journey-production.mp3",
    durationInFrames: 480,
  },

  // === AI Collaboration + Retrospective (29 s) ===
  // Candid tooling beat (OpenAI · Gemini · Cursor) followed by a 3-slide
  // retrospective trio (Learned · Went Well · Differently). Color-themed
  // blue/green/amber to echo the journey section — visual grammar:
  // red flourish = title emphasis, tone flourish = retrospective beat.
  {
    type: "slide",
    id: "ai-collaboration",
    voiceoverFile: "ai-collaboration.mp3",
    durationInFrames: 480,
  },
  {
    type: "slide",
    id: "retro-learned",
    voiceoverFile: "retro-learned.mp3",
    durationInFrames: 420,
  },
  {
    type: "slide",
    id: "retro-went-well",
    voiceoverFile: "retro-went-well.mp3",
    durationInFrames: 420,
  },
  {
    type: "slide",
    id: "retro-differently",
    voiceoverFile: "retro-differently.mp3",
    durationInFrames: 420,
  },

  // === Closing — "Thank you." bookend (13.5 s @ 60 fps) ===
  // Intentionally NO voiceoverFile — the bookend wordmark assembly only
  // completes if the slide holds the full 810 frames. A short MP3 would
  // collapse the design via calcMetadata. The typography lands in silence.
  // Five-phase composition: provocation → turn → gratitude → hold → wordmark.
  // The product mark hero'd in TitleSlide migrates from center to upper-third
  // while the headline morphs from brand-voice ("Stop babysitting your
  // notebooks.") to gratitude ("Thank you."). Action links + a curly
  // hand-drawn flourish under "Thank you." deliver next-steps without
  // competing with the peak. Phase 5 closes the loop: the A mark slides left
  // + shrinks to become the "A" in "Agentic AutoML Platform", which reveals
  // character-by-character to the right — echoing the opening TitleSlide
  // wordmark.
  { type: "slide", id: "closing", durationInFrames: 810 },
];

/**
 * URL-typing intro + four pre-rendered demo captures woven between `agenda`
 * and `tech-stack` in the MP4 build. Isolated in its own export so the
 * presenter bundle never transitively references capture filenames or
 * urlIntro asset paths.
 *
 * Where each demo slots into `DEFAULT_SCENES`:
 *   Beat 0 — URL-typing intro (pure Remotion, 4.5 s)
 *   Beat 1 — Landing scroll (pre-rendered teammate capture)
 *   Beat 2 — Signup form (browser chrome)
 *   Beat 2b — Signup → Gmail verify-email (secondary tab)
 *   Beat 3 — Full app walkthrough (pre-rendered teammate capture)
 */
const DEMO_SCENES: SelectableScene[] = [
  // === Beat 0: URL-typing intro (pure Remotion, 4.5 s) ===
  // Opens on a painterly new-tab backdrop, zooms into the URL pill, and
  // types the product URL. Hard-cuts into landing with pixel-continuous
  // chrome so the browser "page-load" reads as a single continuous shot.
  {
    type: "urlIntro",
    url: "agentic-automl.vercel.app",
    backgroundAsset: "backgrounds/newtab-bg.webp",
    durationInFrames: 330,
  },

  // === Beat 1: Landing scroll (pre-rendered teammate capture) ===
  // Pre-rendered 55.6 s MP4 from the landing-page team, now narrated by
  // `scene-landing.mp3` (see `voiceover/scripts/scene-landing.txt`). Chrome
  // holds 12 f (200 ms) then tweens out over 45 f (750 ms), revealing the
  // full-bleed scroll. Duration is driven by `captures/landing.meta.json`
  // unless the MP3 runs longer, in which case `calculate-metadata` extends.
  {
    type: "demo",
    videoFile: "landing.mp4",
    videoRoot: "captures",
    chrome: "browser",
    url: "agentic-automl.vercel.app",
    voiceoverFile: "scene-landing.mp3",
    durationInFrames: 3336, // 55.6s @ 60 fps fallback — meta.json wins.
    startOffset: 0,
    chromeDismissAt: 12,
    chromeDismissDurationFrames: 45,
  },

  // === Beat 2: Signup form (browser chrome) ===
  // Signup capture shows a `Checking session...` auth-bootstrap screen for
  // ~3 s before the form mounts; the first cursor event (driver start) is at
  // webm t=4.234 s. Opening on the empty form matches the drive's typing beat.
  //
  // The signup webm continues recording through the `/verify-email/pending`
  // state and the moment the second tab opens; the scene's 1500 f budget
  // (25 s) holds on the pending page to bridge into the signup-gmail beat.
  {
    type: "demo",
    videoFile: "signup.webm",
    videoRoot: "captures",
    cursorFile: "signup.cursor.json",
    chrome: "browser",
    url: "app.agentic-automl.dev/signup",
    voiceoverFile: "scene-signup.mp3",
    durationInFrames: 1500,
    startOffset: 4,
  },

  // === Beat 2b: Signup → Gmail → verify-email (secondary tab) ===
  // Playwright opens a second tab mid-signup to drive the Gmail-lookalike
  // verification flow. Persisted as `signup-gmail.webm` + cursor JSON; the
  // tab strip carries two tabs so the chrome hands off visually from beat 2.
  {
    type: "demo",
    videoFile: "signup-gmail.webm",
    videoRoot: "captures",
    cursorFile: "signup-gmail.cursor.json",
    chrome: "browser",
    url: "mail.google.com/mail/u/0/#inbox",
    tabs: [
      { title: "Sign up | Agentic AutoML", active: false },
      { title: "Inbox (1) - Gmail", active: true, appearFrame: 6 },
    ],
    durationInFrames: 900,
    startOffset: 0,
  },

  // === Beat 3: Full app walkthrough (pre-rendered teammate capture) ===
  // Full home → upload → explorer → processing → feature engineering →
  // training → experiments arc (7:46 @ 60 fps). Browser chrome + cursor are
  // baked into the pixels, so `chrome: "none"` bypasses BrowserChrome to
  // avoid a chrome-in-chrome look, and `cursorFile` is omitted since
  // `SyntheticCursor` would render a second pointer on top of the baked one.
  // Narrated by `scene-walkthrough.mp3` (see
  // `voiceover/scripts/scene-walkthrough.txt`) — sparse by design so visuals
  // carry the beats. MP4 duration drives the scene length (meta.json wins);
  // the VO is budgeted ~52% talk / 48% silence.
  {
    type: "demo",
    videoFile: "agentic-automl-demo-new.mp4",
    videoRoot: "captures",
    chrome: "none",
    voiceoverFile: "scene-walkthrough.mp3",
    durationInFrames: 27963, // 466.05s @ 60 fps fallback — meta.json wins.
    startOffset: 0,
  },
];

/**
 * Full ordered composition for the MP4 build. Slides 0-6 open, then demo
 * beats play, then slides 7+ carry the rest. Ordering is preserved from
 * the pre-refactor monolithic list.
 */
export const DEFAULT_SCENES: SelectableScene[] = (() => {
  const opening = SLIDE_SCENES.slice(0, 7); // title..agenda
  const rest = SLIDE_SCENES.slice(7); // tech-stack..closing
  return [...opening, ...DEMO_SCENES, ...rest];
})();

/** Non-slide scene count — surfaced for the presenter-mode demo-leak guard
 *  test. Avoids requiring the test to import `DEFAULT_SCENES` (which would
 *  pull demo string literals into the test bundle unnecessarily). */
export const DEFAULT_NON_SLIDE_COUNT = DEMO_SCENES.length;
