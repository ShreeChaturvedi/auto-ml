import type { TimelineFixture, TypeSchedule } from "../types";
import type { TypeScheduleEntry } from "../../src/frontend-bridge/useFormTyping";

/**
 * Beat 2 — Login → Signup → Home (signup-as-Ayush).
 *
 * All frame numbers below are SCENE-RELATIVE (60 fps). The plan §2.3 stage
 * table gives us a 14 s budget (840 frames) for the full signup flow. Cursor
 * waypoints inside the scene reference the AuthCard's centered position
 * (≈ 760, 260; 400 × 560). Field y-offsets land roughly at the centre of
 * each input. Refine during visual review.
 */

// ---------------------------------------------------------------------------
// Per-character schedule builder
// ---------------------------------------------------------------------------

const FRAMES_PER_CHAR = 7; // ≈ 117 ms/char → ~510 char/min, realistic touch-typing

/**
 * Build a per-character TypeSchedule starting at `startFrame`.
 *
 * - `intervalFrames` is the BASE delay between successive characters.
 * - `perCharPauses[i]` adds extra frames BEFORE character `i` (0-indexed),
 *   used to model word-boundary thinking pauses or hesitation before
 *   special punctuation.
 *
 * The resulting schedule is consumed both by `TypeIntoField` (cosmetic
 * render) and `useTypeIntoInput` (drives the real DOM input via the
 * React-compatible value setter).
 */
function buildSchedule(
  text: string,
  startFrame: number,
  intervalFrames: number = FRAMES_PER_CHAR,
  perCharPauses: Record<number, number> = {},
): readonly TypeScheduleEntry[] {
  const out: TypeScheduleEntry[] = [];
  let f = startFrame;
  for (let i = 0; i < text.length; i++) {
    f += intervalFrames + (perCharPauses[i] ?? 0);
    out.push({ char: text[i]!, frame: f });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-field schedules — text matches `fixtures/auth/ayush-yadav.ts`
// ---------------------------------------------------------------------------

const NAME_TEXT = "Ayush Yadav"; // 11 chars
const EMAIL_TEXT = "yadava5@miamioh.edu"; // 19 chars
const PASSWORD_TEXT = "GradSchool2026!"; // 15 chars

// Scene-relative start frames: each field's typing begins ~24 frames after
// the cursor lands and clicks (cursor latency + click ripple settle).
export const NAME_SCHEDULE: TypeSchedule = buildSchedule(NAME_TEXT, 344, FRAMES_PER_CHAR, {
  // Index 6 = "Y" in "Yadav" — small pause after the space.
  6: 10,
});

export const EMAIL_SCHEDULE: TypeSchedule = buildSchedule(EMAIL_TEXT, 454, FRAMES_PER_CHAR, {
  // Index 7 = "@" — brief hesitation before the at-sign.
  7: 5,
});

export const PASSWORD_SCHEDULE: TypeSchedule = buildSchedule(PASSWORD_TEXT, 628, FRAMES_PER_CHAR);

export const CONFIRM_PASSWORD_SCHEDULE: TypeSchedule = buildSchedule(
  PASSWORD_TEXT,
  814,
  FRAMES_PER_CHAR,
);

// ---------------------------------------------------------------------------
// Scene-level timeline events
// ---------------------------------------------------------------------------

/**
 * Beat 2 SignupScreen timeline. Cursor waypoints, click events, navigation,
 * and SFX. Per-character typing is driven separately by `useTypeIntoInput`
 * mounted alongside the real form (see `SignupScreen.tsx`).
 *
 * Frame budget: ~14 s / 840 frames. Submit fires at 1006, success-chime + go-home
 * whoosh at 1108 (~100 frames after click for the loading → success cycle).
 */
export const SIGNUP_AYUSH: TimelineFixture = {
  id: "signup-ayush",
  events: [
    // Cursor → Name field, click, then schedule begins ~24 frames later.
    { id: "cursor-to-name", start: 326, kind: "cursorTo",
      payload: { target: "name", x: 960, y: 380 } },
    { id: "click-name", start: 344, kind: "click",
      payload: { target: "name" }, durationFrames: 1 },
    { id: "type-name", start: 344, kind: "type",
      payload: { field: "name" } },

    // Email
    { id: "cursor-to-email", start: 430, kind: "cursorTo",
      payload: { target: "email", x: 960, y: 450 } },
    { id: "click-email", start: 454, kind: "click",
      payload: { target: "email" }, durationFrames: 1 },
    { id: "type-email", start: 454, kind: "type",
      payload: { field: "email" } },

    // Password
    { id: "cursor-to-password", start: 604, kind: "cursorTo",
      payload: { target: "password", x: 960, y: 520 } },
    { id: "click-password", start: 628, kind: "click",
      payload: { target: "password" }, durationFrames: 1 },
    { id: "type-password", start: 628, kind: "type",
      payload: { field: "password" } },

    // Confirm password
    { id: "cursor-to-confirm", start: 790, kind: "cursorTo",
      payload: { target: "confirmPassword", x: 960, y: 590 } },
    { id: "click-confirm", start: 814, kind: "click",
      payload: { target: "confirmPassword" }, durationFrames: 1 },
    { id: "type-confirm", start: 814, kind: "type",
      payload: { field: "confirmPassword" } },

    // Submit
    { id: "cursor-to-submit", start: 976, kind: "cursorTo",
      payload: { target: "submit", x: 960, y: 680 } },
    { id: "click-submit", start: 1006, kind: "click",
      payload: { target: "submit" }, durationFrames: 1 },

    // Navigation home (after loading → success cycle in mock auth)
    { id: "navigate-home", start: 1108, kind: "navigate",
      payload: { to: "/", fromUrl: "app.agentic-automl.dev/signup", toUrl: "app.agentic-automl.dev" } },

    // SFX
    { id: "sfx-click-submit", start: 1006, kind: "sfx",
      payload: { file: "click-soft.mp3", volume: 0.6 } },
    { id: "sfx-success", start: 1108, kind: "sfx",
      payload: { file: "success-chime.mp3", volume: 0.7 } },
    { id: "sfx-whoosh-home", start: 1108, kind: "sfx",
      payload: { file: "whoosh-forward.mp3", volume: 0.5 } },
  ],
} as const;

// ---------------------------------------------------------------------------
// Voiceover scripts (consumed by `useTimelineRunner` for {{MARK}} resolution)
// ---------------------------------------------------------------------------

/**
 * Scene-scoped VO script for the signup beat. {{MARK}} tokens map to
 * timeline events that opt-in to mark-anchored start times. The numeric
 * starts above don't reference marks yet — once a real ElevenLabs alignment
 * lands we can promote individual events to `{ mark: "..." }` refs.
 */
export const SIGNUP_VOICEOVER = [
  "{{CTA}} Meet Ayush. He's a data science student at Miami, and he",
  "has a dataset he wants a model for.",
  "",
  "{{SIGNUP}} No account yet — let's fix that.",
  "",
  "{{TYPE_NAME}} Name, school email. {{TYPE_PASSWORD}} Something he",
  "won't forget on his second day.",
  "",
  "{{SUBMIT}} And he's in.",
  "",
  "{{HOMEPAGE}} No project, no data, no starter scripts — yet.",
].join("\n");

/**
 * LoginScreen reuses the same scene-level VO context — Beat 2's narrative
 * arc spans login → signup → home, and the brief login pause window is
 * narratively part of that arc. A separate VO script can be split out
 * later if pacing review surfaces a need.
 */
export const LOGIN_VOICEOVER = SIGNUP_VOICEOVER;
