/**
 * Golden-path smoke test — walks all phase routes and asserts each
 * renders without the PhaseErrorBoundary fallback firing.
 *
 * Scope: navigation + render only. Exercising the LLM workflow
 * end-to-end requires OpenAI credentials, a live Docker Python runtime,
 * and long-running trains — all out of scope for a fast smoke. This
 * test catches the common regression class (dead imports, missing
 * props, broken routes, runtime exceptions on mount) that would have
 * shipped unnoticed when lint/build CI was red.
 *
 * Runs under `npm run benchmark` (testing/playwright.config.ts auto-
 * starts backend:4000 + frontend preview:4173).
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resetBackendData } from '../helpers';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATASET_PATH = path.resolve(testDir, '../fixtures', 'sample_customers.csv');
const SMOKE_PROJECT_NAME = 'Smoke Full Path';

const PHASES: readonly string[] = [
  'upload',
  'data-viewer',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments',
  'deployment'
];

/**
 * Fail fast if the phase-level error boundary rendered its fallback.
 * That's what fires when a phase panel throws during mount — the symptom
 * the user reports as "the page is blank / broken".
 */
async function expectNoPhaseErrorBoundary(page: Page): Promise<void> {
  const errorBoundary = page.getByText('Something went wrong in this phase.', { exact: false });
  await expect(errorBoundary).toHaveCount(0);
}

test.beforeEach(async ({ request }) => {
  await resetBackendData(request);
});

test('every phase route renders without the PhaseErrorBoundary fallback', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // ---- Step 1: project + dataset (reuse benchmark harness UI flow) -------
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const createFirst = page.getByRole('button', { name: /Create Your First Project/i });
  const newProject = page.getByRole('button', { name: /New project/i });
  if (await createFirst.isVisible().catch(() => false)) {
    await createFirst.click();
  } else {
    await newProject.click();
  }

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByLabel('Title').fill(SMOKE_PROJECT_NAME);

  const createReq = page.waitForResponse(
    (r) => r.url().endsWith('/api/projects') && r.request().method() === 'POST' && r.ok()
  );
  await page.getByRole('button', { name: /Create Project/i }).click();
  const createRes = await createReq;
  const { project } = (await createRes.json()) as { project: { id: string } };
  const projectId = project.id;

  // Upload a CSV so data-viewer and downstream phases have something to render.
  await page.goto(`/project/${projectId}/upload`);
  await expect(page.locator('[data-testid="data-upload-panel"]')).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_DATASET_PATH);
  await expect(
    page.locator('[data-testid^="file-card"]').filter({ hasText: 'sample_customers.csv' })
  ).toBeVisible();

  // ---- Step 2: walk each phase route and assert render -------------------
  for (const phase of PHASES) {
    await test.step(`phase: ${phase}`, async () => {
      await page.goto(`/project/${projectId}/${phase}`);
      // Wait for either the phase container to render or an error boundary
      // to show up — whichever loses, we fail cleanly.
      await page.waitForLoadState('networkidle', { timeout: 30_000 });
      await expectNoPhaseErrorBoundary(page);

      // Sanity: the URL should still match the phase we navigated to
      // (unauthorized redirects or auto-redirects would change this).
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/${phase}`));
    });
  }
});
