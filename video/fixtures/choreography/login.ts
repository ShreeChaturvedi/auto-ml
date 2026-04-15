import type { ChoreographyPieceList } from "../types";

/**
 * Beat 2 — Login card assembly (after CTA→card MorphBox completes).
 *
 * Order (see plan §2.1):
 *   title → subtitle → emailField → passwordField → forgotLink →
 *   rememberMe → submitButton → oauthDivider → googleButton → signupLink
 *
 * Each piece's `start` is a frame offset relative to the scene start
 * and should chain via { after: "prevId" } triggers where possible.
 */
export const LOGIN_ASSEMBLY: ChoreographyPieceList = [] as const;
