/**
 * User type definitions for authentication system
 */

export type AuthProvider = 'password' | 'google';

export interface User {
  user_id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  email_verified: boolean;
  auth_provider: AuthProvider;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface CreateUserInput {
  email: string;
  name: string;
  auth_provider?: AuthProvider;
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  password?: string;
}

// Safe user type without password hash for API responses
export type SafeUser = Omit<User, 'password_hash'>;
