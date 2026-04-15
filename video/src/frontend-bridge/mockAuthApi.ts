/**
 * Frame-deterministic replacement for `frontend/src/lib/api/auth.ts`.
 *
 * Every network call resolves synchronously via a microtask with the same
 * hardcoded Ayush fixture, so render-time timing is driven purely by the
 * scene timeline (frame-keyed events) rather than real async latency.
 *
 * Note: the signature of each export matches the real module so real auth
 * components typecheck unchanged.
 */

import type {
  ActiveSession,
  AuthResponse,
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  SafeUser,
  UpdateProfilePayload,
} from "./types";

export type { ActiveSession };

export const ayushFixture: SafeUser = {
  user_id: "ayush-1",
  email: "yadava5@miamioh.edu",
  name: "Ayush Yadav",
  role: "user",
  email_verified: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-04-15T19:30:00.000Z",
  last_login_at: "2026-04-15T19:30:00.000Z",
};

const authResponse = (): AuthResponse => ({
  user: ayushFixture,
  accessToken: "mock-access",
  refreshToken: "mock-refresh",
});

export async function loginUser(_payload: LoginPayload): Promise<AuthResponse> {
  void _payload;
  return Promise.resolve(authResponse());
}

export async function registerUser(
  _payload: RegisterPayload,
): Promise<AuthResponse> {
  void _payload;
  return Promise.resolve(authResponse());
}

export async function logoutUser(_refreshToken: string): Promise<void> {
  void _refreshToken;
  return Promise.resolve();
}

export async function getCurrentUser(): Promise<{ user: SafeUser }> {
  return Promise.resolve({ user: ayushFixture });
}

export async function forgotPassword(
  _payload: ForgotPasswordPayload,
): Promise<{ message: string }> {
  void _payload;
  return Promise.resolve({ message: "Reset link sent" });
}

export async function resetPassword(
  _payload: ResetPasswordPayload,
): Promise<{ message: string }> {
  void _payload;
  return Promise.resolve({ message: "Password updated" });
}

export async function updateProfile(
  _payload: UpdateProfilePayload,
): Promise<{ user: SafeUser }> {
  void _payload;
  return Promise.resolve({ user: ayushFixture });
}

export async function verifyEmail(
  _token: string,
): Promise<{ message: string }> {
  void _token;
  return Promise.resolve({ message: "Email verified" });
}

export async function resendVerification(
  _email?: string,
): Promise<{ message: string }> {
  void _email;
  return Promise.resolve({ message: "Verification resent" });
}

export async function getVerificationStatus(): Promise<{
  emailVerified: boolean;
}> {
  return Promise.resolve({ emailVerified: true });
}

export async function googleAuth(): Promise<{ authUrl: string }> {
  // Returning an empty string skips the `window.location.href = authUrl`
  // redirect in LoginForm / SignupForm — scene code controls navigation.
  return Promise.resolve({ authUrl: "" });
}

export async function googleCallback(_code: string): Promise<AuthResponse> {
  void _code;
  return Promise.resolve(authResponse());
}

export async function getActiveSessions(
  _refreshToken: string | null,
): Promise<ActiveSession[]> {
  void _refreshToken;
  return Promise.resolve([]);
}

export async function revokeSession(_tokenId: string): Promise<void> {
  void _tokenId;
  return Promise.resolve();
}
