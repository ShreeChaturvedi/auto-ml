import type { ChoreographyPieceList } from "../types";

/**
 * Beat 2 — Login card assembly (after CTA→card MorphBox completes).
 *
 * Order (see plan §2.1):
 *   title → subtitle → emailField → passwordField → forgotLink →
 *   rememberMe → submitButton → oauthDivider → googleButton → signupLink
 *
 * Each piece's `start` is a frame offset relative to the scene start.
 *
 * ## Status
 *
 * Currently DOCUMENTATION ONLY. `LoginScreen` renders the real `LoginForm`
 * with a whole-form `useFadeIn` entrance instead of per-piece assembly,
 * because the real `LoginForm` doesn't emit `data-assemble="<id>"` markers
 * and we deliberately don't fork it (would violate "render real components").
 *
 * Future task: either (a) annotate the real form with `data-assemble`
 * attributes, or (b) introduce a wrapper that injects them post-mount, then
 * pass this list directly to `<Assemble>`.
 */
export const LOGIN_ASSEMBLY: ChoreographyPieceList = [
  { id: "title",       start: 40,  from: "bottom", duration: 20 },
  { id: "subtitle",    start: 48,  from: "bottom", duration: 20 },
  { id: "email",       start: 56,  from: "bottom", duration: 20 },
  { id: "password",    start: 64,  from: "bottom", duration: 20 },
  { id: "forgot",      start: 68,  from: "right",  duration: 16 },
  { id: "remember",    start: 72,  from: "left",   duration: 16 },
  { id: "submit",      start: 80,  from: "scale",  duration: 18 },
  { id: "oauth",       start: 96,  from: "bottom", duration: 16 },
  { id: "google",      start: 104, from: "bottom", duration: 16 },
  { id: "signup-link", start: 112, from: "bottom", duration: 16 },
] as const;
