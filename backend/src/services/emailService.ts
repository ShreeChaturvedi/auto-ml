/**
 * EmailService - Handles sending emails for password reset and verification
 *
 * Features:
 * - SMTP-based email sending via nodemailer
 * - HTML email templates for password reset and verification
 * - Graceful fallback to console logging when SMTP is not configured
 * - Connection pooling for efficient email sending
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { env } from '../config.js';

/**
 * Check if SMTP is properly configured
 */
function isSmtpConfigured(): boolean {
  return !!(env.smtpHost && env.smtpUser && env.smtpPassword);
}

/**
 * Create HTML email template for password reset
 */
function createPasswordResetHtml(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 6px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>We received a request to reset your password for your AutoML Toolchain account.</p>
      <p>Click the button below to reset your password:</p>
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 14px; color: #4b5563;">${resetUrl}</p>
      <div class="warning">
        <strong>Important:</strong> This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
      </div>
    </div>
    <div class="footer">
      <p>AutoML Toolchain - AI-Augmented Data Science Platform</p>
      <p>This is an automated message. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Create HTML email template for email verification
 */
function createVerificationHtml(verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to AutoML Toolchain!</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>Thank you for signing up! Please verify your email address to complete your registration.</p>
      <p style="text-align: center;">
        <a href="${verifyUrl}" class="button">Verify Email</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 14px; color: #4b5563;">${verifyUrl}</p>
    </div>
    <div class="footer">
      <p>AutoML Toolchain - AI-Augmented Data Science Platform</p>
      <p>This is an automated message. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    if (isSmtpConfigured()) {
      this.transporter = nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure,
        auth: {
          user: env.smtpUser,
          pass: env.smtpPassword
        }
      });
    }
  }

  /**
   * Check if email service is ready to send emails
   */
  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * Send a password reset email to a user
   *
   * @param email - Recipient email address
   * @param resetToken - Password reset token (will be appended to reset URL)
   */
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${env.frontendUrl}/reset-password?token=${resetToken}`;

    if (!this.transporter) {
      // Development fallback - log to console
      console.log(`[EmailService] Password reset requested for ${email}`);
      console.log(`[EmailService] Reset URL: ${resetUrl}`);
      console.log(`[EmailService] Token expires in 1 hour`);
      console.log(`[EmailService] SMTP not configured - email not sent`);
      return;
    }

    await this.transporter.sendMail({
      from: env.smtpFrom,
      to: email,
      subject: 'Password Reset Request - AutoML Toolchain',
      html: createPasswordResetHtml(resetUrl),
      text: `
Password Reset Request

You requested a password reset for your AutoML Toolchain account.

Click the link below to reset your password:
${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email.

---
AutoML Toolchain - AI-Augmented Data Science Platform
      `.trim()
    });

    console.log(`[EmailService] Password reset email sent to ${email}`);
  }

  /**
   * Send an email verification link to a user
   *
   * @param email - Recipient email address
   * @param verificationToken - Email verification token
   */
  async sendVerificationEmail(email: string, verificationToken: string): Promise<void> {
    const verifyUrl = `${env.frontendUrl}/verify-email?token=${verificationToken}`;

    if (!this.transporter) {
      // Development fallback - log to console
      console.log(`[EmailService] Email verification requested for ${email}`);
      console.log(`[EmailService] Verification URL: ${verifyUrl}`);
      console.log(`[EmailService] SMTP not configured - email not sent`);
      return;
    }

    await this.transporter.sendMail({
      from: env.smtpFrom,
      to: email,
      subject: 'Verify Your Email - AutoML Toolchain',
      html: createVerificationHtml(verifyUrl),
      text: `
Welcome to AutoML Toolchain!

Thank you for signing up! Please verify your email address to complete your registration.

Click the link below to verify your email:
${verifyUrl}

---
AutoML Toolchain - AI-Augmented Data Science Platform
      `.trim()
    });

    console.log(`[EmailService] Verification email sent to ${email}`);
  }

  /**
   * Verify SMTP connection is working
   * Useful for health checks and configuration validation
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('[EmailService] SMTP connection verification failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
