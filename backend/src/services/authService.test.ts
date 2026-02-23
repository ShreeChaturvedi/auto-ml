import { describe, it, expect, beforeEach } from 'vitest';

import type { SafeUser } from '../types/user.js';

import { AuthService, authService } from './authService.js';

describe('authService', () => {
  let service: AuthService;

  const mockUser: SafeUser = {
    user_id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    email_verified: true,
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at: null
  };

  beforeEach(() => {
    service = new AuthService();
  });

  describe('singleton instance', () => {
    it('exports a singleton instance', () => {
      expect(authService).toBeInstanceOf(AuthService);
    });
  });

  describe('hashPassword', () => {
    it('returns a bcrypt hash', async () => {
      const hash = await service.hashPassword('mypassword123');
      expect(hash).toMatch(/^\$2[aby]?\$\d{1,2}\$/);
    });

    it('produces different hashes for same password (due to salt)', async () => {
      const hash1 = await service.hashPassword('samepassword');
      const hash2 = await service.hashPassword('samepassword');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty password', async () => {
      const hash = await service.hashPassword('');
      expect(hash).toMatch(/^\$2[aby]?\$\d{1,2}\$/);
    });

    it('handles unicode passwords', async () => {
      const hash = await service.hashPassword('secret123!');
      expect(hash).toMatch(/^\$2[aby]?\$\d{1,2}\$/);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for correct password', async () => {
      const hash = await service.hashPassword('correctpassword');
      const result = await service.verifyPassword('correctpassword', hash);
      expect(result).toBe(true);
    });

    it('returns false for incorrect password', async () => {
      const hash = await service.hashPassword('correctpassword');
      const result = await service.verifyPassword('wrongpassword', hash);
      expect(result).toBe(false);
    });

    it('returns false for empty password against non-empty hash', async () => {
      const hash = await service.hashPassword('somepassword');
      const result = await service.verifyPassword('', hash);
      expect(result).toBe(false);
    });

    it('handles case sensitivity', async () => {
      const hash = await service.hashPassword('Password123');
      expect(await service.verifyPassword('password123', hash)).toBe(false);
      expect(await service.verifyPassword('PASSWORD123', hash)).toBe(false);
      expect(await service.verifyPassword('Password123', hash)).toBe(true);
    });
  });

  describe('generateAccessToken', () => {
    it('returns a JWT token string', () => {
      const token = service.generateAccessToken(mockUser);
      expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    it('generates different tokens for different users', () => {
      const token1 = service.generateAccessToken(mockUser);
      const token2 = service.generateAccessToken({
        ...mockUser,
        user_id: 'different-user',
        email: 'other@example.com'
      });
      expect(token1).not.toBe(token2);
    });

    it('includes user data in token payload', () => {
      const token = service.generateAccessToken(mockUser);
      const payload = service.verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(mockUser.user_id);
      expect(payload?.email).toBe(mockUser.email);
      expect(payload?.role).toBe(mockUser.role);
    });
  });

  describe('generateRefreshToken', () => {
    it('returns a 128-character hex string', () => {
      const token = service.generateRefreshToken();
      expect(token).toMatch(/^[a-f0-9]{128}$/);
    });

    it('generates unique tokens each call', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(service.generateRefreshToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('generateTokens', () => {
    it('returns both access and refresh tokens', () => {
      const tokens = service.generateTokens(mockUser);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
    });

    it('access token is valid JWT', () => {
      const tokens = service.generateTokens(mockUser);
      expect(tokens.accessToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    it('refresh token is 128-char hex', () => {
      const tokens = service.generateTokens(mockUser);
      expect(tokens.refreshToken).toMatch(/^[a-f0-9]{128}$/);
    });
  });

  describe('verifyAccessToken', () => {
    it('returns payload for valid token', () => {
      const token = service.generateAccessToken(mockUser);
      const payload = service.verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(mockUser.user_id);
    });

    it('returns null for invalid token', () => {
      const payload = service.verifyAccessToken('invalid.token.here');
      expect(payload).toBeNull();
    });

    it('returns null for tampered token', () => {
      const token = service.generateAccessToken(mockUser);
      const tampered = token.slice(0, -5) + 'xxxxx';
      const payload = service.verifyAccessToken(tampered);
      expect(payload).toBeNull();
    });

    it('returns null for empty string', () => {
      const payload = service.verifyAccessToken('');
      expect(payload).toBeNull();
    });

    it('returns null for malformed JWT', () => {
      const payload = service.verifyAccessToken('not-a-jwt');
      expect(payload).toBeNull();
    });
  });

  describe('hashRefreshToken', () => {
    it('returns a SHA-256 hex string (64 chars)', () => {
      const hash = service.hashRefreshToken('sometoken');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces consistent hash for same input', () => {
      const token = 'consistenttoken';
      const hash1 = service.hashRefreshToken(token);
      const hash2 = service.hashRefreshToken(token);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different inputs', () => {
      const hash1 = service.hashRefreshToken('token1');
      const hash2 = service.hashRefreshToken('token2');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty string', () => {
      const hash = service.hashRefreshToken('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generatePasswordResetToken', () => {
    it('returns a 64-character hex string', () => {
      const token = service.generatePasswordResetToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates unique tokens each call', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(service.generatePasswordResetToken());
      }
      expect(tokens.size).toBe(100);
    });
  });
});
