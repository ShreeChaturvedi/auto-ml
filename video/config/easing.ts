import { Easing } from "remotion";

/**
 * Named easing + spring configs used across every video primitive and slide.
 *
 * These mirror `frontend/src/styles/theme.css:92-94` exactly so the video's
 * motion vocabulary matches the running app.
 *
 * Importing these by name prevents inline bezier tuples from drifting across
 * the codebase — treat them the same way the app treats `var(--ease-out)`.
 */

export const EASE_OUT    = Easing.bezier(0.16, 1,   0.3, 1);  // --ease-out
export const EASE_IN     = Easing.bezier(0.4,  0,   1,   1);  // --ease-in
export const EASE_IN_OUT = Easing.bezier(0.25, 1,   0.5, 1);  // --ease-in-out

/** Default UI spring — snappy, minimal overshoot. Use for most fades. */
export const SPRING_UI     = { damping: 200, mass: 0.6 } as const;
/** Calmer settle — for wordmarks and hero text where overshoot reads as jitter. */
export const SPRING_SETTLE = { damping: 120 } as const;
/** Hero spring — allows the one big scale-in (80% number, logo apex). Limit to ONE per slide. */
export const SPRING_HERO   = { damping: 140 } as const;
