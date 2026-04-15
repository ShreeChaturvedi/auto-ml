import type { ChoreographyPieceList } from "../types";

/**
 * Beat 2 — Signup card assembly (after login→signup transition).
 *
 * Order (see plan §2.2):
 *   title → subtitle → nameField → emailField → passwordField →
 *   confirmPasswordField → termsCheckbox → submitButton → oauthDivider →
 *   googleButton → loginLink
 *
 * Each piece's `start` is a frame offset relative to the scene start
 * and should chain via { after: "prevId" } triggers where possible.
 */
export const SIGNUP_ASSEMBLY: ChoreographyPieceList = [] as const;
