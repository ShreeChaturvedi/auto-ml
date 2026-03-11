import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPasswordResetUrl,
  buildVerificationUrl,
  EmailService
} from './emailService.js';

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
      verify: vi.fn().mockResolvedValue(true)
    }))
  }
}));

// Mock config
vi.mock('../config.js', () => ({
  env: {
    frontendUrl: 'http://localhost:5173',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPassword: '',
    smtpFrom: 'Test <test@example.com>'
  }
}));

describe('EmailService', () => {
  describe('when SMTP is not configured', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService();
    });

    it('isConfigured returns false', () => {
      expect(service.isConfigured()).toBe(false);
    });

    it('sendPasswordResetEmail resolves without throwing', async () => {
      await expect(
        service.sendPasswordResetEmail('user@example.com', 'reset-token-123')
      ).resolves.toBeUndefined();
    });

    it('sendVerificationEmail resolves without throwing', async () => {
      await expect(
        service.sendVerificationEmail('user@example.com', 'verify-token-456')
      ).resolves.toBeUndefined();
    });

    it('verifyConnection returns false', async () => {
      const result = await service.verifyConnection();
      expect(result).toBe(false);
    });

    it('builds the correct reset URL', () => {
      expect(buildPasswordResetUrl('my-token')).toBe(
        'http://localhost:5173/reset-password?token=my-token'
      );
    });

    it('builds the correct verification URL', () => {
      expect(buildVerificationUrl('verify-token')).toBe(
        'http://localhost:5173/verify-email?token=verify-token'
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('does not throw when called', async () => {
      const service = new EmailService();
      await expect(
        service.sendPasswordResetEmail('user@test.com', 'token')
      ).resolves.not.toThrow();
    });

    it('handles various email formats', async () => {
      const service = new EmailService();
      const emails = [
        'simple@example.com',
        'user.name@example.com',
        'user+tag@example.com',
        'user@subdomain.example.com'
      ];

      for (const email of emails) {
        await expect(
          service.sendPasswordResetEmail(email, 'token')
        ).resolves.not.toThrow();
      }
    });
  });

  describe('sendVerificationEmail', () => {
    it('does not throw when called', async () => {
      const service = new EmailService();
      await expect(
        service.sendVerificationEmail('user@test.com', 'token')
      ).resolves.not.toThrow();
    });
  });
});
