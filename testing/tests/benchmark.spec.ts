import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetBackendData } from '../helpers';

const datasetMetadataPath = process.env.AUTOML_DATASET_METADATA_PATH;
const storagePath = process.env.AUTOML_STORAGE_PATH;
const datasetFilesPath = process.env.AUTOML_DATASET_FILES_PATH;

if (!datasetMetadataPath || !storagePath || !datasetFilesPath) {
  throw new Error('Benchmark environment paths were not provided by Playwright configuration.');
}

const SAMPLE_PROJECT_NAME = 'Benchmark Project';
const SAMPLE_FILENAME = 'sample_customers.csv';
const testDir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATASET_PATH = path.resolve(testDir, '../fixtures', SAMPLE_FILENAME);

test.beforeEach(async ({ request }) => {
  await resetBackendData(request);
});

test('project creation and dataset upload work end-to-end', async ({ page, request }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const createFirstProjectButton = page.getByRole('button', { name: /Create Your First Project/i });
  if (await createFirstProjectButton.isVisible()) {
    await createFirstProjectButton.click();
  } else {
    await page.getByRole('button', { name: /New project/i }).click();
  }

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await page.getByLabel('Title').fill(SAMPLE_PROJECT_NAME);
  const createRequest = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/projects') &&
      response.request().method() === 'POST' &&
      response.ok()
  );
  await page.getByRole('button', { name: /Create Project/i }).click();
  const createResponse = await createRequest;
  const createdProject = (await createResponse.json()) as { project: { id: string } };
  const createdProjectId = createdProject.project.id;
  await expect(dialog).toBeHidden();

  await page.goto(`/project/${createdProjectId}/upload`);
  await expect(page.locator('[data-testid="data-upload-panel"]')).toBeVisible();

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(SAMPLE_DATASET_PATH);

  const fileCard = page.locator('[data-testid^="file-card"]').filter({ hasText: SAMPLE_FILENAME });
  await expect(fileCard).toBeVisible();

  const continueButton = page.getByRole('button', { name: /Continue to Data Viewer/i });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  await expect(page).toHaveURL(/\/project\/.*\/data-viewer$/);
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row', { name: /Alice/ })).toBeVisible();

  const benchmarkApiBase = process.env.BENCHMARK_API_BASE ?? 'http://localhost:4100/api';

  await expect.poll(async () => {
    const response = await request.get(`${benchmarkApiBase}/projects`);
    if (!response.ok()) return false;
    const data = (await response.json()) as { projects: Array<{ name: string }> };
    return data.projects.some((project) => project.name === SAMPLE_PROJECT_NAME);
  }, { interval: 250, timeout: 10_000 }).toBeTruthy();

  let datasetFromApi: { datasetId: string; filename: string } | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${benchmarkApiBase}/datasets`);
    if (!response.ok()) return false;
    const data = (await response.json()) as { datasets: Array<{ datasetId: string; filename: string }> };
    datasetFromApi = data.datasets.find((entry) => entry.filename === SAMPLE_FILENAME);
    return Boolean(datasetFromApi);
  }, { interval: 250, timeout: 10_000 }).toBeTruthy();

  if (!datasetFromApi) {
    throw new Error('Dataset metadata entry not found after upload.');
  }

  const datasetFilePath = path.join(datasetFilesPath, datasetFromApi.datasetId, SAMPLE_FILENAME);
  test.info().annotations.push({ type: 'dataset-file', description: datasetFilePath });
});
