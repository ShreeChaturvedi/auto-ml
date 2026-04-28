import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { getApiBase } from '../helpers';

const API_BASE = getApiBase();
const testDir = path.dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = path.resolve(testDir, '../fixtures/mock_customer_churn_clean.csv');
const ITERATIONS = Number(process.env.PREPROCESSING_STRESS_ITERATIONS ?? '5');

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

interface ApiProject {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

interface ApiDataset {
  datasetId: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}

async function registerUser(request: APIRequestContext): Promise<AuthResponse> {
  const email = `prep-live-${randomUUID()}@automl.test`;
  const response = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'Playwright2026!', name: 'Preprocessing Live Stress' }
  });
  if (!response.ok()) {
    throw new Error(`register failed: ${response.status()} ${await response.text()}`);
  }
  return response.json() as Promise<AuthResponse>;
}

async function createProject(request: APIRequestContext, token: string): Promise<ApiProject> {
  const response = await request.post(`${API_BASE}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `Preprocessing Live ${randomUUID().slice(0, 8)}`,
      metadata: {
        unlockedPhases: ['upload', 'data-viewer', 'preprocessing', 'feature-engineering', 'training', 'experiments', 'deployment'],
        completedPhases: [],
        currentPhase: 'preprocessing'
      }
    }
  });
  if (!response.ok()) {
    throw new Error(`project failed: ${response.status()} ${await response.text()}`);
  }
  return ((await response.json()) as { project: ApiProject }).project;
}

async function uploadDataset(request: APIRequestContext, token: string, projectId: string) {
  const response = await request.post(`${API_BASE}/upload/dataset`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      projectId,
      file: {
        name: path.basename(DATASET_PATH),
        mimeType: 'text/csv',
        buffer: readFileSync(DATASET_PATH)
      }
    }
  });
  if (!response.ok()) {
    throw new Error(`upload failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as { dataset: { datasetId: string; filename: string } };
}

async function createNotebook(request: APIRequestContext, token: string, projectId: string) {
  const response = await request.post(`${API_BASE}/projects/${projectId}/notebooks`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      name: 'Workbook 1',
      kind: 'phase',
      metadata: {
        phase: 'preprocessing',
        tabId: 'processing-tab-1',
        tabName: 'Workbook 1'
      }
    }
  });
  if (!response.ok()) {
    throw new Error(`notebook create failed: ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

async function listDatasets(
  request: APIRequestContext,
  token: string,
  projectId: string
): Promise<ApiDataset[]> {
  const response = await request.get(`${API_BASE}/datasets?projectId=${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok()) {
    throw new Error(`dataset list failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json() as { datasets?: ApiDataset[] } | ApiDataset[];
  return Array.isArray(body) ? body : (body.datasets ?? []);
}

async function listRuns(
  request: APIRequestContext,
  token: string,
  projectId: string
): Promise<Array<{ runId?: string }>> {
  const response = await request.get(`${API_BASE}/preprocessing/runs?projectId=${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok()) {
    throw new Error(`preprocessing runs failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json() as { runs?: Array<{ runId?: string }> };
  return body.runs ?? [];
}

async function getDatasetSample(
  request: APIRequestContext,
  token: string,
  datasetId: string
): Promise<{ columns?: unknown[] }> {
  const response = await request.get(`${API_BASE}/datasets/${datasetId}/sample`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok()) {
    throw new Error(`dataset sample failed: ${response.status()} ${await response.text()}`);
  }
  return response.json() as Promise<{ columns?: unknown[] }>;
}

async function seedAuth(page: Page, auth: AuthResponse, project: ApiProject) {
  await page.addInitScript(({ a, p }) => {
    localStorage.clear();
    sessionStorage.clear();

    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        accessToken: a.accessToken,
        refreshToken: a.refreshToken,
        user: { ...a.user, email_verified: true },
        isAuthenticated: true,
        isLoading: false,
        error: null
      },
      version: 1
    }));

    localStorage.setItem('automl-projects-storage', JSON.stringify({
      state: {
        projects: [{
          id: p.id,
          title: p.name,
          description: p.description ?? '',
          icon: p.icon ?? 'Folder',
          color: p.color ?? 'blue',
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          unlockedPhases: ['upload', 'data-viewer', 'preprocessing', 'feature-engineering', 'training', 'experiments', 'deployment'],
          completedPhases: [],
          currentPhase: 'preprocessing',
          metadata: p.metadata ?? {}
        }],
        activeProjectId: p.id
      },
      version: 3
    }));

    localStorage.setItem('automl-llm-model-selection-v1', JSON.stringify({
      state: {
        selectedModel: 'gpt-5.4-mini',
        reasoningEffort: 'low'
      },
      version: 1
    }));
  }, { a: auth, p: project });
}

async function interceptVerifiedAuth(page: Page, auth: AuthResponse) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { ...auth.user, email_verified: true } })
    });
  });
}

async function chooseDataset(page: Page, filename: string) {
  const dialog = page.getByRole('dialog', { name: 'Select a dataset' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: new RegExp(filename.replace(/\./g, '\\.'), 'i') }).click();
  await dialog.getByRole('button', { name: 'Start with this dataset' }).click();
}

async function submitPrompt(page: Page, prompt: string) {
  const composer = page.getByLabel('Message input');
  await composer.click();
  await composer.fill('');
  await page.keyboard.insertText(prompt);
  await page.getByLabel('Send message').click();
}

async function waitForStableDerivedDataset(params: {
  page: Page;
  request: APIRequestContext;
  token: string;
  projectId: string;
  sourceDatasetId: string;
  expectedColumn: string;
  expectedRunId?: string;
  expectedDatasetId?: string;
}) {
  let retryClicks = 0;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const retryButton = params.page.getByRole('button', { name: 'Retry' });
    if (retryClicks < 2 && await retryButton.count() > 0) {
      await retryButton.first().click();
      retryClicks += 1;
    }

    const datasets = await listDatasets(params.request, params.token, params.projectId);
    const derived = datasets.filter((dataset) => dataset.metadata?.derivedFrom === params.sourceDatasetId);

    if (derived.length === 1) {
      const derivedDatasetId = derived[0]?.datasetId;
      const sample = await getDatasetSample(params.request, params.token, derivedDatasetId);
      const columns = Array.isArray(sample.columns) ? sample.columns.map((entry) => String(entry)) : [];
      const hasExpectedColumn = columns.includes(params.expectedColumn);

      const runs = await listRuns(params.request, params.token, params.projectId);
      const runIds = runs
        .map((run) => (typeof run.runId === 'string' ? run.runId : ''))
        .filter((runId) => runId.length > 0);
      const singleRun = runIds.length === 1;
      const runMatches = params.expectedRunId ? runIds[0] === params.expectedRunId : true;
      const datasetMatches = params.expectedDatasetId ? derivedDatasetId === params.expectedDatasetId : true;

      if (hasExpectedColumn && singleRun && runMatches && datasetMatches) {
        return {
          datasetId: derivedDatasetId,
          runId: runIds[0]
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`timed out waiting for column ${params.expectedColumn} without dataset/run forking`);
}

test.describe.serial('preprocessing live continuity', () => {
  test.skip(
    process.env.LLM_PROVIDER === 'mock',
    'requires a live provider because it validates prompt-specific preprocessing transforms'
  );

  test('keeps one preprocessing run and one derived dataset across repeated prompts in the same workbook', async ({
    page,
    request
  }) => {
    test.setTimeout(900_000);

    const auth = await registerUser(request);
    const project = await createProject(request, auth.accessToken);
    const upload = await uploadDataset(request, auth.accessToken, project.id);
    await createNotebook(request, auth.accessToken, project.id);

    await seedAuth(page, auth, project);
    await interceptVerifiedAuth(page, auth);

    await page.goto(`/project/${project.id}/preprocessing`);
    await chooseDataset(page, upload.dataset.filename);
    await expect(page.getByText('Something went wrong in this phase.', { exact: false })).toHaveCount(0);

    let derivedDatasetId: string | undefined;
    let preprocessingRunId: string | undefined;

    for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
      const iterationLabel = String(iteration).padStart(2, '0');
      const columnName = `stress_iter_${iterationLabel}`;
      const prompt = `Add integer column ${columnName} with constant value ${iteration}. Keep all existing columns and preserve earlier stress_iter columns.`;

      await submitPrompt(page, prompt);

      const state = await waitForStableDerivedDataset({
        page,
        request,
        token: auth.accessToken,
        projectId: project.id,
        sourceDatasetId: upload.dataset.datasetId,
        expectedColumn: columnName,
        expectedRunId: preprocessingRunId,
        expectedDatasetId: derivedDatasetId
      });

      derivedDatasetId = state.datasetId;
      preprocessingRunId = state.runId;

      await expect(page.getByText('Something went wrong in this phase.', { exact: false })).toHaveCount(0);
      await expect(page.getByLabel('Send message')).toBeVisible({ timeout: 30_000 });
    }

    expect(derivedDatasetId).toMatch(/^[0-9a-f-]{8,}$/);
    expect(preprocessingRunId).toMatch(/^prep-/);
  });
});
