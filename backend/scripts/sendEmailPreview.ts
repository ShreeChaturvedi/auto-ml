/**
 * Send the verification email (current template) to a real inbox for client-side QA.
 * Run: npx tsx scripts/sendEmailPreview.ts <recipient-email>
 */
import nodemailer from 'nodemailer';

import { createVerificationHtml, logoAttachments } from '../src/services/emailService.js';

const recipient = process.argv[2];
if (!recipient) {
  console.error('Usage: npx tsx scripts/sendEmailPreview.ts <recipient-email>');
  process.exit(1);
}

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_FROM,
} = process.env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
  console.error('SMTP not configured. Check backend/.env');
  process.exit(1);
}

const previewUrl = 'http://localhost:5173/verify-email?token=demo-preview-abcd1234efgh5678';
const html = createVerificationHtml(previewUrl);

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 465),
  secure: SMTP_SECURE === 'true',
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
});

transporter
  .sendMail({
    from: SMTP_FROM,
    to: recipient,
    subject: '[Preview] Verify your email · Agentic AutoML Platform',
    html,
    text: `Verify your email: ${previewUrl}`,
    attachments: logoAttachments(),
  })
  .then((info) => {
    console.log('SENT:', info.messageId);
    console.log('Response:', info.response);
  })
  .catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
