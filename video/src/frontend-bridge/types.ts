/**
 * Local mirrors of frontend type shapes used by the bridge shims.
 *
 * We don't import directly from `../../../frontend/src/types/*` because the
 * frontend worktree doesn't ship a local `node_modules/react`, and pulling
 * those files into TypeScript's compilation would break `import type React
 * from 'react'` lookups. Keeping the shapes here costs a small amount of
 * duplication but isolates the video workspace's type-check from the
 * frontend's module-resolution setup. Keep in sync with:
 *   frontend/src/types/user.ts
 *   frontend/src/types/project.ts
 *   frontend/src/types/phase.ts
 *   frontend/src/lib/api/auth.ts  (ActiveSession)
 */

// --- frontend/src/types/user.ts -------------------------------------------

export interface SafeUser {
  user_id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

// --- frontend/src/lib/api/auth.ts (ActiveSession) -------------------------

export interface ActiveSession {
  token_id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  current: boolean;
}

// --- frontend/src/types/phase.ts ------------------------------------------

export type Phase =
  | "upload"
  | "data-viewer"
  | "preprocessing"
  | "feature-engineering"
  | "training"
  | "experiments"
  | "deployment";

// --- frontend/src/types/project.ts ----------------------------------------

export type ProjectColor =
  | "blue"
  | "green"
  | "purple"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "indigo"
  | "teal"
  | "cyan"
  | "custom";

export interface Project {
  id: string;
  title: string;
  description?: string;
  icon: string;
  color: ProjectColor;
  customColor?: string;
  createdAt: Date;
  updatedAt: Date;
  unlockedPhases: Phase[];
  currentPhase: Phase;
  completedPhases: Phase[];
  metadata?: Record<string, unknown>;
}

export interface ProjectFormData {
  title: string;
  description?: string;
  icon: string;
  color: ProjectColor;
  customColor?: string;
}
