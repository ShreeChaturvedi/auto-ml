import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApiBase, resetBackendData } from '../helpers';

const datasetMetadataPath = process.env.AUTOML_DATASET_METADATA_PATH;
const storagePath = process.env.AUTOML_STORAGE_PATH;
const datasetFilesPath = process.env.AUTOML_DATASET_FILES_PATH;
const API_BASE = getApiBase();

if (!datasetMetadataPath || !storagePath || !datasetFilesPath) {
  throw new Error('Benchmark environment paths were not provided by Playwright configuration.');
}

const SAMPLE_PROJECT_NAME = 'Benchmark Project';
const SAMPLE_FILENAME = 'sample_customers.csv';
const testDir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATASET_PATH = path.resolve(testDir, '../fixtures', SAMPLE_FILENAME);

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

async function registerTestUser(request: APIRequestContext): Promise<AuthResponse> {
  const email = `benchmark-${randomUUID()}@automl.test`;
  const response = await request.post(`${API_BASE}/auth/register`, {
    data: {
      email,
      password: 'Playwright2026!',
      name: 'Benchmark Bot',
    },
  });

  if (!response.ok()) {
    throw new Error(`Registration failed: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

async function seedAuth(page: Page, auth: AuthResponse) {
  await page.addInitScript(({ authState }) => {
    localStorage.clear();
    sessionStorage.clear();

    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        accessToken: authState.accessToken,
        refreshToken: authState.refreshToken,
        user: { ...authState.user, email_verified: true },
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
      version: 1,
    }));

    localStorage.setItem('automl-projects-storage', JSON.stringify({
      state: {
        projects: [],
        activeProjectId: null,
      },
      version: 3,
    }));
  }, { authState: auth });
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

test.beforeEach(async ({ request }) => {
  await resetBackendData(request);
});

test('project creation and dataset upload work end-to-end', async ({ page, request }) => {
  const auth = await registerTestUser(request);

  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await seedAuth(page, auth);
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { ...auth.user, email_verified: true } }),
    });
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

  await page.getByPlaceholder('Project name').fill(SAMPLE_PROJECT_NAME);
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

  const uploadedFile = page.getByText(SAMPLE_FILENAME, { exact: true });
  await expect(uploadedFile).toBeVisible();

  const benchmarkApiBase = process.env.BENCHMARK_API_BASE ?? 'http://localhost:4100/api';

  await expect.poll(async () => {
    const response = await request.get(`${benchmarkApiBase}/projects`, {
      headers: authHeaders(auth.accessToken),
    });
    if (!response.ok()) return false;
    const data = (await response.json()) as { projects: Array<{ name: string }> };
    return data.projects.some((project) => project.name === SAMPLE_PROJECT_NAME);
  }, { interval: 250, timeout: 10_000 }).toBeTruthy();

  let datasetFromApi: { datasetId: string; filename: string } | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${benchmarkApiBase}/datasets?projectId=${encodeURIComponent(createdProjectId)}`, {
      headers: authHeaders(auth.accessToken),
    });
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
