import { afterEach, describe, expect, it, vi } from 'vitest';

const defaultEnv = {
  frontendUrl: 'http://localhost:5173',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFrom: 'Test <test@example.com>'
};

async function loadEmailServiceModule(envOverrides: Partial<typeof defaultEnv> = {}) {
  vi.resetModules();

  const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-message-id' });
  const verify = vi.fn().mockResolvedValue(true);
  const createTransport = vi.fn(() => ({
    sendMail,
    verify
  }));

  vi.doMock('nodemailer', () => ({
    default: { createTransport }
  }));
  vi.doMock('../config.js', () => ({
    env: {
      ...defaultEnv,
      ...envOverrides
    }
  }));

  const module = await import('./emailService.js');
  createTransport.mockClear();
  sendMail.mockClear();
  verify.mockClear();

  return {
    ...module,
    createTransport,
    sendMail,
    verify
  };
}

afterEach(() => {
  vi.doUnmock('nodemailer');
  vi.doUnmock('../config.js');
  vi.resetModules();
});

describe('EmailService', () => {
  describe('when SMTP is not configured', () => {
    it('isConfigured returns false', async () => {
      const { EmailService, createTransport } = await loadEmailServiceModule();
      const service = new EmailService();

      expect(createTransport).not.toHaveBeenCalled();
      expect(service.isConfigured()).toBe(false);
    });

    it('sendPasswordResetEmail resolves without throwing', async () => {
      const { EmailService } = await loadEmailServiceModule();
      const service = new EmailService();

      await expect(
        service.sendPasswordResetEmail('user@example.com', 'reset-token-123')
      ).resolves.toBeUndefined();
    });

    it('sendVerificationEmail resolves without throwing', async () => {
      const { EmailService } = await loadEmailServiceModule();
      const service = new EmailService();

      await expect(
        service.sendVerificationEmail('user@example.com', 'verify-token-456')
      ).resolves.toBeUndefined();
    });

    it('verifyConnection returns false', async () => {
      const { EmailService } = await loadEmailServiceModule();
      const service = new EmailService();

      await expect(service.verifyConnection()).resolves.toBe(false);
    });

    it('builds the correct reset URL', async () => {
      const { buildPasswordResetUrl } = await loadEmailServiceModule();

      expect(buildPasswordResetUrl('my-token')).toBe(
        'http://localhost:5173/reset-password?token=my-token'
      );
    });

    it('builds the correct verification URL', async () => {
      const { buildVerificationUrl } = await loadEmailServiceModule();

      expect(buildVerificationUrl('verify-token')).toBe(
        'http://localhost:5173/verify-email?token=verify-token'
      );
    });
  });

  describe('when SMTP is configured', () => {
    const smtpEnv = {
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'smtp-user',
      smtpPassword: 'smtp-password',
      smtpFrom: 'Agentic AutoML Platform <noreply@example.com>'
    };

    it('creates a transporter with the configured SMTP settings', async () => {
      const { EmailService, createTransport } = await loadEmailServiceModule(smtpEnv);
      const service = new EmailService();

      expect(service.isConfigured()).toBe(true);
      expect(createTransport).toHaveBeenCalledOnce();
      expect(createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: {
          user: 'smtp-user',
          pass: 'smtp-password'
        }
      });
    });

    it('passes the expected password reset payload to nodemailer', async () => {
      const { EmailService, sendMail } = await loadEmailServiceModule(smtpEnv);
      const service = new EmailService();

      await service.sendPasswordResetEmail('user@test.com', 'token');

      expect(sendMail).toHaveBeenCalledOnce();
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Agentic AutoML Platform <noreply@example.com>',
          to: 'user@test.com',
          subject: 'Password Reset Request - Agentic AutoML Platform',
          html: expect.stringContaining('/reset-password?token=token'),
          text: expect.stringContaining('/reset-password?token=token')
        })
      );
    });

    it('delegates SMTP verification to the transporter', async () => {
      const { EmailService, verify } = await loadEmailServiceModule(smtpEnv);
      const service = new EmailService();

      await expect(service.verifyConnection()).resolves.toBe(true);
      expect(verify).toHaveBeenCalledOnce();
    });
  });
});
