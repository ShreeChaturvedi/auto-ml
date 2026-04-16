import React from "react";
import { Composition } from "remotion";
import { FPS } from "../config/fps";
import { DIMENSIONS } from "../config/layout";
import type { SelectableScene } from "../config/scenes";
import { videoConf } from "../config/scenes";
import { DEFAULT_THEME } from "../config/themes";
import { Main } from "./Main";
import { calcMetadata } from "./calculate-metadata/calc-metadata";

/**
 * Default chapter list for `AgendaSlide`. Read from `scene.meta.chapters` —
 * the slide parses them at runtime with a type-guard so a malformed payload
 * falls back to its own internal copy.
 *
 * `as const` preserves literal types + `readonly` — `meta` is typed as
 * `Record<string, unknown>` so the payload is widened at the boundary.
 */
const DEFAULT_CHAPTERS = [
  { title: "Upload & Project Planning", timestamp: "02:05" },
  { title: "Data Exploration — EDA + Natural-Language SQL", timestamp: "04:40" },
  {
    title: "Preprocessing — the LangGraph finite state machine",
    timestamp: "08:10",
    accent: true,
  },
  { title: "Feature Engineering", timestamp: "12:05" },
  { title: "Training — sandboxed Docker notebooks", timestamp: "14:20" },
  { title: "Experiments & Leaderboard", timestamp: "17:05" },
  { title: "What's Next", timestamp: "19:40" },
] as const;

/**
 * Initial scene list.
 *
 * This is intentionally tiny. Slide-agent and demo-capture will expand it
 * over time. The order here is the order scenes play in the final video.
 *
 * To preview a single scene in the Studio, you can use the sidebar to
 * scrub to the relevant time range. If you need an isolated composition
 * for iterating on a single scene, add a new `<Composition>` below
 * with a 1-item `scenes` array.
 */
const DEFAULT_SCENES: SelectableScene[] = [
  { type: "slide", id: "title", durationInFrames: 540 },
  { type: "slide", id: "hook", durationInFrames: 720 },
  { type: "slide", id: "team", durationInFrames: 840 },
  { type: "slide", id: "acknowledgements", durationInFrames: 780 },
  { type: "slide", id: "problem-trio", durationInFrames: 2040 },
  { type: "slide", id: "why-now", durationInFrames: 1440 },
  {
    type: "slide",
    id: "agenda",
    durationInFrames: 1620,
    meta: { chapters: DEFAULT_CHAPTERS },
  },
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

  // === Beat 1: Landing scroll (full-bleed Playwright capture) ===
  // Playwright's `recordVideo` starts encoding at `newContext()`, so the first
  // ~1 s of the webm is blank while the page loads + fonts settle. Skip past
  // it with `startOffset` so the scene opens on real content, not a blank flash.
  //
  // `chrome: "browser"` opens on the same pill UrlIntro committed to; the
  // chrome then dismisses over ~45 f (750 ms) starting at f=12 (200 ms hold)
  // so the full-bleed scroll beat isn't letterboxed by the frame.
  {
    type: "demo",
    videoFile: "landing.webm",
    videoRoot: "captures",
    cursorFile: "landing.cursor.json",
    chrome: "browser",
    url: "agentic-automl.vercel.app",
    voiceoverFile: "scene-landing.mp3",
    durationInFrames: 3600, // 60s at 60 fps — overridden by MP3 duration when present
    startOffset: 1,
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

  // === Beat 3: Home arrival (mac window) ===
  // Home content only appears at t=4 s of the webm (page load + Zustand auth
  // hydration + staggered HomePage entry animations). With the scene's 4 s
  // budget, `startOffset: 4` is what makes the beat show the greeting at all.
  {
    type: "demo",
    videoFile: "home.webm",
    videoRoot: "captures",
    cursorFile: "home.cursor.json",
    chrome: "mac",
    voiceoverFile: "scene-home.mp3",
    durationInFrames: 240,
    startOffset: 4,
  },
];

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="main"
      component={Main}
      schema={videoConf}
      // initial fallbacks — `calculateMetadata` overrides them from scene data.
      width={DIMENSIONS.landscape.width}
      height={DIMENSIONS.landscape.height}
      fps={FPS}
      durationInFrames={600}
      defaultProps={{
        theme: DEFAULT_THEME,
        canvasLayout: "landscape" as const,
        platform: "youtube" as const,
        scenes: DEFAULT_SCENES,
        scenesAndMetadata: [],
        chapters: [],
      }}
      calculateMetadata={calcMetadata}
    />
  );
};
