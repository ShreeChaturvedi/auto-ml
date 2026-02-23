/**
 * Authentication API Client
 * Handles all auth-related API calls
 */

import { apiRequest } from './client';
import type {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  ForgotPasswordPayload,
  ResetPasswordPayload,
  UpdateProfilePayload,
  SafeUser
} from '@/types/user';

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function logoutUser(refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken })
  });
}

export async function getCurrentUser(): Promise<{ user: SafeUser }> {
  return apiRequest<{ user: SafeUser }>('/auth/me');
}

export async function forgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<{ user: SafeUser }> {
  return apiRequest<{ user: SafeUser }>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Initiate Google OAuth flow
 * Returns a URL to redirect the user to Google's consent screen
 */
export async function googleAuth(): Promise<{ authUrl: string }> {
  return apiRequest<{ authUrl: string }>('/auth/google', {
    method: 'GET'
  });
}

/**
 * Complete Google OAuth flow after callback
 * Exchanges the authorization code for tokens
 */
export async function googleCallback(code: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/google/callback', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
}
