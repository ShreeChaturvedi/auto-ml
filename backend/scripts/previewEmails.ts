/**
 * Render email templates to /tmp with dummy URLs for visual review.
 *
 * Rewrites `cid:` image references to point at a copy of the logo PNG so the
 * preview renders standalone (CID resolution only happens when delivered via
 * an email client).
 *
 * Run: npx tsx scripts/previewEmails.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPasswordResetHtml,
  createVerificationHtml,
} from '../src/services/emailService.js';

const DUMMY_TOKEN = 'demo-preview-abcd1234efgh5678ijkl9012';
const outDir = '/tmp';
const assetsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/assets'
);

// Copy both logo variants so the prefers-color-scheme toggle works in preview.
const logoMap: Array<[string, string]> = [
  ['logo-on-light.png', 'email-preview-logo-on-light.png'],
  ['logo-on-dark.png', 'email-preview-logo-on-dark.png'],
];
for (const [src, dst] of logoMap) {
  fs.copyFileSync(path.join(assetsDir, src), path.join(outDir, dst));
}

function rewriteCidsForPreview(html: string): string {
  return html
    .replace(/src="cid:automl-logo-on-light@v1"/g, `src="email-preview-logo-on-light.png"`)
    .replace(/src="cid:automl-logo-on-dark@v1"/g, `src="email-preview-logo-on-dark.png"`);
}

const verifyHtml = rewriteCidsForPreview(
  createVerificationHtml(
    `http://localhost:5173/verify-email?token=${DUMMY_TOKEN}`
  )
);
const resetHtml = rewriteCidsForPreview(
  createPasswordResetHtml(
    `http://localhost:5173/reset-password?token=${DUMMY_TOKEN}`
  )
);

const verifyPath = path.join(outDir, 'email-preview-verify.html');
const resetPath = path.join(outDir, 'email-preview-reset.html');

fs.writeFileSync(verifyPath, verifyHtml, 'utf-8');
fs.writeFileSync(resetPath, resetHtml, 'utf-8');

console.log(`Wrote:\n  ${verifyPath}\n  ${resetPath}`);
