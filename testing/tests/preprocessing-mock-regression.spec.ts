import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { buildPreprocessingMockDatasetVariants } from '../support/preprocessingMockDatasets.mjs';

const API_BASE = `${process.env.AUTOML_API_BASE_URL ?? 'http://127.0.0.1:4000'}/api`;
const WORKFLOW_PROMPT = 'Create a safe preprocessing checkpoint for this dataset and summarize the result.';
const variantMap = new Map(buildPreprocessingMockDatasetVariants().map((variant) => [variant.name, variant]));
const AUTH_BYPASS = process.env.AUTOML_BENCHMARK_AUTH_BYPASS === 'true' || process.env.BENCHMARK_AUTH_BYPASS === 'true';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

interface BenchmarkAuthContext extends AuthResponse {
  headers: Record<string, string>;
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

async function registerUser(request: APIRequestContext): Promise<BenchmarkAuthContext> {
  if (AUTH_BYPASS) {
    const userId = randomUUID();
    const email = `${userId.slice(0, 12)}@benchmark.local`;
    return {
      accessToken: 'benchmark-bypass',
      refreshToken: 'benchmark-bypass',
      user: {
        user_id: userId,
        email,
        name: 'Preprocessing UI Regression',
        role: 'user',
        email_verified: true
      },
      headers: {
        Authorization: 'Bearer benchmark-bypass',
        'x-benchmark-user-id': userId,
        'x-benchmark-user-email': email,
        'x-benchmark-user-name': 'Preprocessing UI Regression'
      }
    };
  }

  const email = `prep-ui-${randomUUID()}@automl.test`;
  const response = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'Playwright2026!', name: 'Preprocessing UI Regression' }
  });
  if (!response.ok()) {
    throw new Error(`register failed: ${response.status()} ${await response.text()}`);
  }
  const auth = await response.json() as AuthResponse;
  return {
    ...auth,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`
    }
  };
}

async function createProject(request: APIRequestContext, auth: BenchmarkAuthContext): Promise<ApiProject> {
  const response = await request.post(`${API_BASE}/projects`, {
    headers: auth.headers,
    data: {
      name: `Preprocessing Mock ${randomUUID().slice(0, 8)}`,
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

async function uploadDataset(
  request: APIRequestContext,
  auth: BenchmarkAuthContext,
  projectId: string,
  variant: { fileName: string; mimeType: string; buffer: Buffer }
) {
  const response = await request.post(`${API_BASE}/upload/dataset`, {
    headers: auth.headers,
    multipart: {
      projectId,
      file: {
        name: variant.fileName,
        mimeType: variant.mimeType,
        buffer: variant.buffer
      }
    }
  });

  if (!response.ok()) {
    throw new Error(`upload failed: ${response.status()} ${await response.text()}`);
  }

  const body = await response.json() as { dataset: { datasetId: string; filename: string } };
  return body.dataset;
}

async function seedAuth(page: Page, auth: AuthResponse, project: ApiProject) {
  await page.addInitScript(({ a, p }) => {
    localStorage.clear();
    sessionStorage.clear();
    const verifiedUser = { ...a.user, email_verified: true };
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        accessToken: a.accessToken,
        refreshToken: a.refreshToken,
        user: verifiedUser,
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

async function waitForDerivedDataset(
  request: APIRequestContext,
  auth: BenchmarkAuthContext,
  projectId: string,
  sourceDatasetId: string
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get(`${API_BASE}/datasets?projectId=${encodeURIComponent(projectId)}`, {
      headers: auth.headers
    });
    if (!response.ok()) {
      throw new Error(`dataset list failed: ${response.status()} ${await response.text()}`);
    }

    const body = await response.json() as { datasets?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    const datasets = Array.isArray(body) ? body : (body.datasets ?? []);
    const derived = datasets.find((dataset) => {
      const metadata = dataset.metadata as Record<string, unknown> | undefined;
      return metadata?.derivedFrom === sourceDatasetId;
    });
    if (derived && typeof derived.datasetId === 'string') {
      const sampleResponse = await request.get(`${API_BASE}/datasets/${derived.datasetId}/sample`, {
        headers: auth.headers
      });
      if (!sampleResponse.ok()) {
        throw new Error(`dataset sample failed: ${sampleResponse.status()} ${await sampleResponse.text()}`);
      }
      const sampleBody = await sampleResponse.json() as Record<string, unknown>;
      const sampleRows = sampleBody.sampleRows ?? sampleBody.sample ?? sampleBody.rows;
      if (Array.isArray(sampleRows) && sampleRows.length > 0) {
        return derived.datasetId;
      }
    }

    await pageDelay(1000);
  }

  throw new Error('Timed out waiting for derived dataset.');
}

async function getRunSnapshot(
  request: APIRequestContext,
  auth: BenchmarkAuthContext,
  projectId: string,
  runId: string
) {
  const response = await request.get(
    `${API_BASE}/preprocessing/runs/${encodeURIComponent(runId)}?projectId=${encodeURIComponent(projectId)}`,
    {
      headers: auth.headers
    }
  );
  if (!response.ok()) {
    throw new Error(`preprocessing run snapshot failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as { run?: { derivedDatasetIds?: string[]; steps?: Array<Record<string, unknown>> } };
}

async function pageDelay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function selectDatasetAndSubmit(page: Page, fileName: string) {
  const dialog = page.getByRole('dialog', { name: 'Select a dataset' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: new RegExp(fileName.replace(/\./g, '\\.'), 'i') }).click();
  await dialog.getByRole('button', { name: 'Start with this dataset' }).click();

  const composer = page.getByLabel('Message input');
  await composer.click();
  await page.keyboard.insertText(WORKFLOW_PROMPT);
  await page.getByLabel('Send message').click();
}

async function assertWorkflowSucceeded(page: Page) {
  await expect(page.getByText('Create preprocessing test checkpoint', { exact: false })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Execution succeeded', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Validation passed', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Committed', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Execution failed', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Something went wrong in this phase.', { exact: false })).toHaveCount(0);
}

const scenarios = [
  { label: 'clean-1', variant: 'clean' },
  { label: 'clean-2', variant: 'clean' },
  { label: 'clean-3', variant: 'clean' },
  { label: 'tsv', variant: 'tsv' },
  { label: 'ragged-rows', variant: 'ragged_rows' }
] as const;

test.describe.serial('preprocessing mock regression', () => {
  test.setTimeout(120_000);

  for (const scenario of scenarios) {
    test(`completes the preprocessing UI workflow for ${scenario.label}`, async ({ page, request }) => {
      const variant = variantMap.get(scenario.variant);
      if (!variant) {
        throw new Error(`Missing dataset variant ${scenario.variant}`);
      }

      const auth = await registerUser(request);
      const project = await createProject(request, auth);
      const uploadedDataset = await uploadDataset(request, auth, project.id, variant);

      await seedAuth(page, auth, project);
      await interceptVerifiedAuth(page, auth);
      await page.goto(`/project/${project.id}/preprocessing`);
      await selectDatasetAndSubmit(page, uploadedDataset.filename);
      await assertWorkflowSucceeded(page);

      const derivedDatasetId = await waitForDerivedDataset(
        request,
        auth,
        project.id,
        uploadedDataset.datasetId
      );

      const runsResponse = await request.get(`${API_BASE}/preprocessing/runs?projectId=${encodeURIComponent(project.id)}`, {
        headers: auth.headers
      });
      expect(runsResponse.ok()).toBeTruthy();
      const runsBody = await runsResponse.json() as {
        runs?: Array<{ runId?: string; latestEventType?: string }>;
      };
      const matchingRun = runsBody.runs?.find((run) => typeof run.runId === 'string');
      expect(matchingRun?.latestEventType).toMatch(/^(checkpoint_created|step_committed)$/);

      const runSnapshot = await getRunSnapshot(request, auth, project.id, matchingRun?.runId ?? '');
      expect(runSnapshot.run?.derivedDatasetIds).toContain(derivedDatasetId);
      const committedStep = runSnapshot.run?.steps?.find(
        (step) => step.title === 'Create preprocessing test checkpoint'
      );
      expect(committedStep?.status).toBe('applied');
      expect(committedStep?.lastExecuteSucceeded).toBe(true);
      expect(committedStep?.lastValidateSucceeded).toBe(true);
      expect(derivedDatasetId).toMatch(/^[0-9a-f-]{8,}$/);
    });
  }
});
