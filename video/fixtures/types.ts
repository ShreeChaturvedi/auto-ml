import type { AssemblePiece } from "../remotion/primitives/Assemble";
import type { AppTimelineEvent, AppScreenId } from "../config/scenes";
import type { TypeScheduleEntry } from "../src/frontend-bridge/useFormTyping";
import type { BBox, MorphBoxStyle } from "../remotion/primitives/MorphBox";

export type ChoreographyPieceList = readonly AssemblePiece[];

export type TimelineFixture = {
  /** Human-friendly id; scenes may log this. */
  id: string;
  /** Events consumed by an appScene's `timeline` array. */
  events: readonly AppTimelineEvent[];
};

export type TypeSchedule = readonly TypeScheduleEntry[];

export type MorphSpec = {
  sourceBbox: BBox;
  destBbox: BBox;
  sourceStyle: MorphBoxStyle;
  destStyle: MorphBoxStyle;
  durationFrames: number;
  /** Spring name to pass through to MorphBox. */
  spring?: "SPRING_UI" | "SPRING_SETTLE" | "SPRING_HERO";
};

/** Ayush-style user fixture used by auth scenes. */
export type AuthUserFixture = {
  /** Passed to SignupForm and LoginForm. */
  name: string;
  email: string;
  password: string;
  /** Optional confirm-password if different (typically same as password). */
  confirmPassword?: string;
};

/** Maps screen → timeline fixture that can be threaded into the scene. */
export type TimelineByScreen = Partial<Record<AppScreenId, TimelineFixture>>;
