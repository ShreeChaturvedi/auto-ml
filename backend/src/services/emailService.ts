/**
 * EmailService - Handles sending emails for password reset and verification
 *
 * Features:
 * - SMTP-based email sending via nodemailer
 * - HTML email templates for password reset and verification
 * - Graceful fallback to console logging when SMTP is not configured
 * - Connection pooling for efficient email sending
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';

// Brand logo — two rasterized PNGs (2× at 72×72, displayed at 18×18).
// Both ship as CID attachments; a CSS `prefers-color-scheme` media query
// toggles which one is visible. CID embedding renders correctly in Gmail,
// Apple Mail, Outlook, and web clients — inline SVG is typically stripped.
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets');
const LOGO_ON_DARK_PATH = path.join(ASSETS_DIR, 'logo-on-dark.png');   // white icon, used when bg is dark
const LOGO_ON_LIGHT_PATH = path.join(ASSETS_DIR, 'logo-on-light.png'); // black icon, used when bg is light
const LOGO_ON_DARK_CID = 'automl-logo-on-dark@v1';
const LOGO_ON_LIGHT_CID = 'automl-logo-on-light@v1';

// ─── Template tokens (hoisted — none depend on per-call opts) ────────────────
const PALETTE = {
  light: { bg: '#F3F4F5', shell: '#FFFFFF', border: 'rgba(10,10,11,0.06)',  text: '#0A0A0B', textMuted: '#5E626B', textDim: '#8A8F98' },
  dark:  { bg: '#0A0A0B', shell: '#0F1011', border: 'rgba(255,255,255,0.10)', text: '#F7F8F8', textMuted: '#9AA0A8', textDim: '#5E626B' },
} as const;

const FONT_SANS = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const FONT_MONO = `'SF Mono', 'Cascadia Code', 'Roboto Mono', Menlo, Consolas, monospace`;

// Background artwork — layered radial glow + filmic grain (SVG data URI).
// Mirrors landing/src/styles/grain.css and the hero lighting. Outlook strips
// both (no gradient/SVG support); modern clients render all layers.
//
// The SVG is fully `encodeURIComponent`-escaped (including `'` → `%27`) so
// the resulting `url(…)` contains no bare quotes or spaces — bare quotes
// inside an HTML `style="…"` attribute truncate the style at the first inner
// quote and silently drop the rest of the CSS.
const grainSvg = (alpha: number, channel: 0 | 1) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7'/><feColorMatrix values='0 0 0 0 ${channel}  0 0 0 0 ${channel}  0 0 0 0 ${channel}  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
const encodeForCssUrl = (s: string) => encodeURIComponent(s).replace(/'/g, '%27');
const GRAIN_LIGHT = `url(data:image/svg+xml;charset=utf-8,${encodeForCssUrl(grainSvg(0.07, 0))})`;
const GRAIN_DARK = `url(data:image/svg+xml;charset=utf-8,${encodeForCssUrl(grainSvg(0.08, 1))})`;

const GLOW_LIGHT =
  `radial-gradient(ellipse 110% 55% at 50% 0%, rgba(10,10,11,0.045) 0%, rgba(10,10,11,0) 60%), ` +
  `radial-gradient(ellipse 80% 50% at 100% 100%, rgba(10,10,11,0.025) 0%, rgba(10,10,11,0) 60%)`;
const GLOW_DARK =
  `radial-gradient(ellipse 110% 55% at 50% 0%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 60%), ` +
  `radial-gradient(ellipse 80% 50% at 100% 100%, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0) 55%)`;

const SHELL_BG_IMAGE_LIGHT = `${GRAIN_LIGHT}, ${GLOW_LIGHT}`;
const SHELL_BG_IMAGE_DARK = `${GRAIN_DARK}, ${GLOW_DARK}`;
const SHELL_BG_REPEAT = 'repeat, no-repeat, no-repeat';
const SHELL_BG_SIZE = '200px 200px, auto, auto';

// CTA variants — two fully-styled buttons in the markup, one shown per theme.
// Toggling visibility is more reliable in Gmail mobile than overriding
// `bgcolor` / `background-image` on a single cell via @media.
const CTA_VARIANTS = {
  light: {
    className: 'automl-cta-for-light',
    initialDisplay: 'table',
    bg: '#0A0A0B',
    gradient: 'linear-gradient(180deg,#1A1C1F 0%,#0A0A0B 100%)',
    shadow: '0 0 0 1px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.10)',
    text: '#F7F8F8',
  },
  dark: {
    className: 'automl-cta-for-dark',
    initialDisplay: 'none',
    bg: '#F7F8F8',
    gradient: 'linear-gradient(180deg,#F7F8F8 0%,#E6E6E6 100%)',
    shadow: '0 0 0 1px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.18)',
    text: '#0A0A0B',
  },
} as const;

/**
 * Render one CTA button. Label and arrow glyph are each wrapped in a <span>
 * with explicit color — Gmail iOS overrides <a> link colors on dark cells
 * but leaves <span> colors intact.
 */
function renderCtaButton(variant: keyof typeof CTA_VARIANTS, label: string, url: string): string {
  const v = CTA_VARIANTS[variant];
  return `<table role="presentation" class="${v.className}" cellpadding="0" cellspacing="0" border="0" style="display:${v.initialDisplay};">
            <tr><td bgcolor="${v.bg}" style="background-color:${v.bg};background-image:${v.gradient};border-radius:7px;box-shadow:${v.shadow};">
              <a href="${escape(url)}" class="automl-cta"
                 style="display:inline-block;padding:0 42px;height:46px;line-height:46px;font-family:${FONT_SANS};font-size:16px;font-weight:510;color:${v.text};text-decoration:none;border-radius:7px;">
                <span style="color:${v.text};">${escape(label)}</span><span style="display:inline-block;padding-left:11px;font-weight:400;color:${v.text};">→</span>
              </a>
            </td></tr>
          </table>`;
}

/**
 * Check if SMTP is properly configured
 */
function isSmtpConfigured(): boolean {
  return !!(env.smtpHost && env.smtpUser && env.smtpPassword);
}

export function buildPasswordResetUrl(resetToken: string): string {
  return `${env.frontendUrl}/reset-password?token=${resetToken}`;
}

export function buildVerificationUrl(verificationToken: string): string {
  return `${env.frontendUrl}/verify-email?token=${verificationToken}`;
}

/**
 * Shared email layout matching the Agentic AutoML Platform landing aesthetic.
 *
 * Design principles:
 * - **Dual-theme**: light mode is the BASE (inline styles), dark mode is a
 *   `@media (prefers-color-scheme: dark)` override. This is critical — Gmail
 *   iOS in a light-mode phone renders the base styles; a dark-only design
 *   breaks there (user reports white-on-white).
 * - Landing aesthetic is grayscale-only in both modes. No accent hues.
 * - CTA button mirrors the landing Hero's "Get Started" — solid fill, inline
 *   arrow, soft elevation shadow; colors invert between modes.
 * - Logo: two CID-attached PNGs (`logo-on-light`, `logo-on-dark`); CSS toggles
 *   visibility so the icon always contrasts with the bg it sits on.
 * - Every background-bearing <td>/<table> declares both the `bgcolor` HTML
 *   attribute AND `background-color:` inline — mobile clients that strip one
 *   typically honor the other.
 */
interface EmailLayoutOpts {
  title: string;     // <title>
  heading: string;   // large sentence-case heading
  intro: string;     // short intro sentence
  ctaLabel: string;  // button text
  ctaUrl: string;    // button href (also used as fallback link)
  expiry: string;    // short expiry string (e.g. "24 hours", "1 hour")
  closing: string;   // closing line (e.g. "Didn't sign up? Ignore this email.")
}

function renderEmailLayout(opts: EmailLayoutOpts): string {
  const L = PALETTE.light;
  const D = PALETTE.dark;

  return `<!DOCTYPE html>
<html lang="en" style="margin:0;padding:0;background-color:${L.bg};color-scheme:light dark;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escape(opts.title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;510;590&display=swap" rel="stylesheet">
  <style>
    body { margin:0 !important; padding:0 !important; }
    a { text-decoration: none; }
    .automl-cta:hover { transform: translateY(-1px); }
    @media only screen and (max-width: 620px) {
      .automl-shell { width:100% !important; }
      .automl-pad { padding-left:24px !important; padding-right:24px !important; }
      .automl-heading { font-size:28px !important; line-height:1.15 !important; }
    }
    /* Dark mode override (standard) */
    @media (prefers-color-scheme: dark) {
      body, .automl-outer, .automl-outer-cell { background-color:${D.bg} !important; }
      .automl-shell, .automl-cell { background-color:${D.shell} !important; }
      .automl-shell { background-image:${SHELL_BG_IMAGE_DARK} !important; }
      .automl-border-top { border-top-color:${D.border} !important; }
      .automl-text-primary { color:${D.text} !important; }
      .automl-text-muted, .automl-text-muted a { color:${D.textMuted} !important; }
      .automl-text-dim { color:${D.textDim} !important; }
      .automl-cta-for-light { display:none !important; }
      .automl-cta-for-dark { display:table !important; }
      .automl-logo-on-light { display:none !important; }
      .automl-logo-on-dark { display:inline-block !important; }
    }
    /* Gmail Android tags its body with [data-ogsc] in dark mode — mirror the @media rules */
    [data-ogsc] body, [data-ogsc] .automl-outer, [data-ogsc] .automl-outer-cell { background-color:${D.bg} !important; }
    [data-ogsc] .automl-shell, [data-ogsc] .automl-cell { background-color:${D.shell} !important; }
    [data-ogsc] .automl-shell { background-image:${SHELL_BG_IMAGE_DARK} !important; }
    [data-ogsc] .automl-border-top { border-top-color:${D.border} !important; }
    [data-ogsc] .automl-text-primary { color:${D.text} !important; }
    [data-ogsc] .automl-text-muted, [data-ogsc] .automl-text-muted a { color:${D.textMuted} !important; }
    [data-ogsc] .automl-text-dim { color:${D.textDim} !important; }
    [data-ogsc] .automl-cta-for-light { display:none !important; }
    [data-ogsc] .automl-cta-for-dark { display:table !important; }
    [data-ogsc] .automl-logo-on-light { display:none !important; }
    [data-ogsc] .automl-logo-on-dark { display:inline-block !important; }
  </style>
</head>
<body bgcolor="${L.bg}" style="margin:0;padding:0;background-color:${L.bg};font-family:${FONT_SANS};-webkit-font-smoothing:antialiased;">
  <!-- Preheader (hidden preview text shown in inbox listings) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">
    ${escape(opts.intro)}
  </div>

  <table role="presentation" class="automl-outer" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.bg}" style="background-color:${L.bg};">
    <tr><td class="automl-outer-cell" align="center" bgcolor="${L.bg}" style="padding:56px 16px;background-color:${L.bg};">

      <table role="presentation" class="automl-shell" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.shell}"
             style="width:560px;max-width:560px;background-color:${L.shell};background-image:${SHELL_BG_IMAGE_LIGHT};background-repeat:${SHELL_BG_REPEAT};background-size:${SHELL_BG_SIZE};border-radius:16px;overflow:hidden;">

        <!-- Header: logo + wordmark, top right -->
        <tr><td class="automl-pad automl-cell" bgcolor="${L.shell}" style="padding:28px 36px 0 36px;background-color:${L.shell};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td></td>
              <td align="right" style="vertical-align:middle;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;line-height:0;padding-right:8px;">
                      <img src="cid:${LOGO_ON_LIGHT_CID}" class="automl-logo-on-light" alt="" width="18" height="18" style="display:inline-block;border:0;outline:none;vertical-align:middle;">
                      <img src="cid:${LOGO_ON_DARK_CID}" class="automl-logo-on-dark"  alt="" width="18" height="18" style="display:none;border:0;outline:none;vertical-align:middle;">
                    </td>
                    <td style="vertical-align:middle;">
                      <span class="automl-text-primary" style="font-family:${FONT_SANS};font-size:14px;font-weight:590;letter-spacing:-0.005em;color:${L.text};line-height:1;">Agentic AutoML Platform</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Heading + intro -->
        <tr><td class="automl-pad automl-cell" bgcolor="${L.shell}" style="padding:64px 36px 0 36px;background-color:${L.shell};">
          <h1 class="automl-heading automl-text-primary" style="margin:0 0 14px 0;font-family:${FONT_SANS};font-size:34px;font-weight:500;letter-spacing:-0.025em;line-height:1.08;color:${L.text};">
            ${escape(opts.heading)}
          </h1>
          <p class="automl-text-muted" style="margin:0;font-family:${FONT_SANS};font-size:16px;line-height:1.55;color:${L.textMuted};max-width:460px;">
            ${escape(opts.intro)}
          </p>
        </td></tr>

        <!-- CTA — two fully-styled buttons; @media toggles which is visible (see CTA_VARIANTS) -->
        <tr><td class="automl-pad automl-cell" bgcolor="${L.shell}" style="padding:32px 36px 0 36px;background-color:${L.shell};">
          ${renderCtaButton('light', opts.ctaLabel, opts.ctaUrl)}
          ${renderCtaButton('dark', opts.ctaLabel, opts.ctaUrl)}
        </td></tr>

        <!-- Fallback link + expiry — sans, sentence case (matches intro paragraph tone) -->
        <tr><td class="automl-pad automl-cell" bgcolor="${L.shell}" style="padding:32px 36px 0 36px;background-color:${L.shell};">
          <p class="automl-text-dim" style="margin:0 0 6px 0;font-family:${FONT_SANS};font-size:14px;line-height:1.5;color:${L.textDim};">
            Or paste this link — expires in ${escape(opts.expiry)}.
          </p>
          <p class="automl-text-muted" style="margin:0;font-family:${FONT_SANS};font-size:14px;line-height:1.5;color:${L.textMuted};word-break:break-all;">
            <a href="${escapeAttr(opts.ctaUrl)}" style="color:${L.textMuted};text-decoration:none;">${escape(opts.ctaUrl)}</a>
          </p>
        </td></tr>

        <!-- Closing -->
        <tr><td class="automl-pad automl-cell" bgcolor="${L.shell}" style="padding:40px 36px 32px 36px;background-color:${L.shell};">
          <p class="automl-text-dim" style="margin:0;font-family:${FONT_SANS};font-size:14px;line-height:1.55;color:${L.textDim};">
            ${escape(opts.closing)}
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td class="automl-pad automl-cell automl-border-top" bgcolor="${L.shell}" style="padding:20px 36px 26px 36px;background-color:${L.shell};border-top:1px solid ${L.border};">
          <span class="automl-text-dim" style="font-family:${FONT_MONO};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${L.textDim};">© 2026 · Agentic AutoML Platform</span>
        </td></tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escape(s);
}

/**
 * Create HTML email template for password reset
 */
export function createPasswordResetHtml(resetUrl: string): string {
  return renderEmailLayout({
    title: 'Reset your password · Agentic AutoML Platform',
    heading: 'Reset your password.',
    intro: 'Click below to choose a new password.',
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
    expiry: '1 hour',
    closing:
      "Didn't request this? Ignore this email — your password won't change until you click the link above.",
  });
}

/**
 * Create HTML email template for email verification
 */
export function createVerificationHtml(verifyUrl: string): string {
  return renderEmailLayout({
    title: 'Verify your email · Agentic AutoML Platform',
    heading: 'One last step.',
    intro: 'Confirm your email to finish setting up your account.',
    ctaLabel: 'Verify email',
    ctaUrl: verifyUrl,
    expiry: '24 hours',
    closing: "Didn't sign up? You can safely ignore this email.",
  });
}

/**
 * Returns the CID attachment descriptors for the two logo variants — the
 * template references both via `<img src="cid:...">` and toggles their
 * visibility with `prefers-color-scheme`. Must be passed to every sendMail()
 * call from this service so the CIDs resolve in the recipient's client.
 */
export function logoAttachments() {
  return [
    {
      filename: 'logo-on-light.png',
      path: LOGO_ON_LIGHT_PATH,
      cid: LOGO_ON_LIGHT_CID,
      contentDisposition: 'inline' as const,
    },
    {
      filename: 'logo-on-dark.png',
      path: LOGO_ON_DARK_PATH,
      cid: LOGO_ON_DARK_CID,
      contentDisposition: 'inline' as const,
    },
  ];
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
      appLogger.info(`[EmailService] SMTP delivery enabled (${env.smtpHost}:${env.smtpPort}, from: ${env.smtpFrom})`);
    } else {
      appLogger.warn('[EmailService] SMTP not configured — emails will log to console only');
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
    const resetUrl = buildPasswordResetUrl(resetToken);

    if (!this.transporter) {
      // Development fallback - log to console
      appLogger.info(`[EmailService] Password reset requested for ${email}`);
      appLogger.info(`[EmailService] Reset URL: ${resetUrl}`);
      appLogger.info(`[EmailService] Token expires in 1 hour`);
      appLogger.info(`[EmailService] SMTP not configured - email not sent`);
      return;
    }

    await this.transporter.sendMail({
      from: env.smtpFrom,
      to: email,
      subject: 'Reset your password · Agentic AutoML Platform',
      html: createPasswordResetHtml(resetUrl),
      text: `Reset your password.

Click below to choose a new password (link expires in 1 hour):
${resetUrl}

Didn't request this? Ignore this email — your password won't change until you click the link above.

— Agentic AutoML Platform`,
      attachments: logoAttachments(),
    });

    appLogger.info(`[EmailService] Password reset email sent to ${email}`);
  }

  /**
   * Send an email verification link to a user
   *
   * @param email - Recipient email address
   * @param verificationToken - Email verification token
   */
  async sendVerificationEmail(email: string, verificationToken: string): Promise<void> {
    const verifyUrl = buildVerificationUrl(verificationToken);

    if (!this.transporter) {
      // Development fallback - log to console
      appLogger.info(`[EmailService] Email verification requested for ${email}`);
      appLogger.info(`[EmailService] Verification URL: ${verifyUrl}`);
      appLogger.info(`[EmailService] SMTP not configured - email not sent`);
      return;
    }

    await this.transporter.sendMail({
      from: env.smtpFrom,
      to: email,
      subject: 'Verify your email · Agentic AutoML Platform',
      html: createVerificationHtml(verifyUrl),
      text: `One last step.

Confirm your email to finish setting up your account (link expires in 24 hours):
${verifyUrl}

Didn't sign up? You can safely ignore this email.

— Agentic AutoML Platform`,
      attachments: logoAttachments(),
    });

    appLogger.info(`[EmailService] Verification email sent to ${email}`);
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
      appLogger.error('[EmailService] SMTP connection verification failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
