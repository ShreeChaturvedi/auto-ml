import type { ChoreographyPieceList } from "../types";

/**
 * Beat 2 — Signup card assembly (after login→signup transition).
 *
 * Order (see plan §2.2):
 *   title → subtitle → nameField → emailField → passwordField →
 *   confirmPasswordField → submitButton → oauthDivider → googleButton → loginLink
 *
 * Each piece's `start` is a frame offset relative to the scene start.
 *
 * ## Status
 *
 * Currently DOCUMENTATION ONLY. `SignupScreen` renders the real `SignupForm`
 * with a whole-form `useFadeIn` entrance instead of per-piece assembly.
 * Same trade-off as `login.ts` — see that file for the full rationale.
 */
export const SIGNUP_ASSEMBLY: ChoreographyPieceList = [
  { id: "title",            start: 40,  from: "bottom", duration: 20 },
  { id: "subtitle",         start: 48,  from: "bottom", duration: 20 },
  { id: "name",             start: 56,  from: "bottom", duration: 20 },
  { id: "email",            start: 64,  from: "bottom", duration: 20 },
  { id: "password",         start: 72,  from: "bottom", duration: 20 },
  { id: "confirm-password", start: 80,  from: "bottom", duration: 20 },
  { id: "submit",           start: 92,  from: "scale",  duration: 18 },
  { id: "oauth",            start: 108, from: "bottom", duration: 16 },
  { id: "google",           start: 116, from: "bottom", duration: 16 },
  { id: "login-link",       start: 124, from: "bottom", duration: 16 },
] as const;
