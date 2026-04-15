import type { TimelineFixture, TypeSchedule } from "../types";

/**
 * Beat 2 — Login → Signup → Home.
 *
 * TODO: Populate per-character TypeSchedules for name / email / password /
 * confirm-password fields. See plan §2.3 for the exact frame table.
 */
export const NAME_SCHEDULE: TypeSchedule = [] as const;
export const EMAIL_SCHEDULE: TypeSchedule = [] as const;
export const PASSWORD_SCHEDULE: TypeSchedule = [] as const;
export const CONFIRM_PASSWORD_SCHEDULE: TypeSchedule = [] as const;

export const SIGNUP_AYUSH: TimelineFixture = {
  id: "signup-ayush",
  events: [],
} as const;
