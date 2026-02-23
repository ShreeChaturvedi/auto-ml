import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { EmailService } from './emailService.js';

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
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('when SMTP is not configured', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService();
    });

    it('isConfigured returns false', () => {
      expect(service.isConfigured()).toBe(false);
    });

    it('sendPasswordResetEmail logs to console', async () => {
      await service.sendPasswordResetEmail('user@example.com', 'reset-token-123');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Password reset requested for user@example.com')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('reset-token-123')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SMTP not configured')
      );
    });

    it('sendVerificationEmail logs to console', async () => {
      await service.sendVerificationEmail('user@example.com', 'verify-token-456');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Email verification requested for user@example.com')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('verify-token-456')
      );
    });

    it('verifyConnection returns false', async () => {
      const result = await service.verifyConnection();
      expect(result).toBe(false);
    });

    it('generates correct reset URL', async () => {
      await service.sendPasswordResetEmail('test@example.com', 'my-token');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:5173/reset-password?token=my-token')
      );
    });

    it('generates correct verification URL', async () => {
      await service.sendVerificationEmail('test@example.com', 'verify-token');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:5173/verify-email?token=verify-token')
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
