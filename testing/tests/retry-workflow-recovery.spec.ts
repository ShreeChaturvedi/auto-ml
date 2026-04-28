import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApiBase, getFrontendBase } from '../helpers';

const API_BASE = getApiBase();
const FRONTEND_BASE = getFrontendBase();
const testDir = path.dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = path.resolve(testDir, '../fixtures', 'mock_customer_churn_clean.csv');
const DATASET_BUFFER = readFileSync(DATASET_PATH);

const EXPECTED_MODEL = 'gpt-5.3-codex';
const EXPECTED_REASONING = 'medium';

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

async function registerUser(request: APIRequestContext): Promise<AuthResponse> {
  const email = `functional-retry-${randomUUID()}@automl.test`;
  const res = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'Functional2026!', name: 'Functional Retry' }
  });
  if (!res.ok()) {
    throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

async function createProject(request: APIRequestContext, token: string): Promise<ApiProject> {
  const res = await request.post(`${API_BASE}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `Retry Probe ${randomUUID().slice(0, 8)}`,
      metadata: {
        unlockedPhases: [
          'upload',
          'data-viewer',
          'preprocessing',
          'feature-engineering',
          'training',
          'experiments',
          'deployment'
        ],
        completedPhases: [],
        currentPhase: 'preprocessing'
      }
    }
  });
  if (!res.ok()) {
    throw new Error(`project failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { project: ApiProject }).project;
}

async function uploadDataset(request: APIRequestContext, token: string, projectId: string) {
  const res = await request.post(`${API_BASE}/upload/dataset`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      projectId,
      file: {
        name: 'mock_customer_churn_clean.csv',
        mimeType: 'text/csv',
        buffer: DATASET_BUFFER
      }
    },
    timeout: 120_000
  });
  if (!res.ok()) {
    throw new Error(`upload failed: ${res.status()} ${await res.text()}`);
  }
}

async function seedAuth(page: Page, auth: AuthResponse, project: ApiProject) {
  await page.addInitScript(({ a, p, model, reasoning }) => {
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
    localStorage.setItem('automl-llm-model-selection-v1', JSON.stringify({
      state: {
        selectedModel: model,
        reasoningEffort: reasoning
      },
      version: 1
    }));
  }, { a: auth, p: project, model: EXPECTED_MODEL, reasoning: EXPECTED_REASONING });
}

test.describe.configure({ mode: 'serial' });

test('preprocessing retry button resubmits the last prompt with gpt-5.3-codex', async ({ page, request }) => {
  test.setTimeout(120_000);

  const auth = await registerUser(request);
  const project = await createProject(request, auth.accessToken);
  await uploadDataset(request, auth.accessToken, project.id);
  await seedAuth(page, auth, project);

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { ...auth.user, email_verified: true } })
    });
  });

  const capturedBodies: Array<Record<string, unknown>> = [];
  let workflowRequestCount = 0;
  await page.route('**/api/workflows/turns/stream', async (route) => {
    workflowRequestCount += 1;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    capturedBodies.push(body);

    const ndjson = workflowRequestCount === 1
      ? [
          JSON.stringify({
            type: 'workflow_error',
            message: 'Temporary retryable failure for validation.',
            retryable: true,
            code: 'TOOL_CALL_LIMIT_EXCEEDED'
          }),
          JSON.stringify({ type: 'done' })
        ].join('\n')
      : [
          JSON.stringify({ type: 'token', text: 'Recovered after retry.' }),
          JSON.stringify({ type: 'done' })
        ].join('\n');

    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${ndjson}\n`
    });
  });

  await page.goto(`${FRONTEND_BASE}/project/${project.id}/preprocessing`);
  await page.waitForLoadState('domcontentloaded');

  await page.getByRole('button', { name: 'Start with this dataset' }).click();
  const composer = page.getByLabel('Message input');
  await composer.waitFor({ state: 'visible', timeout: 15_000 });
  await composer.fill('Drop rows with missing values and continue.');
  await page.getByRole('button', { name: 'Send message' }).click();

  const retryButton = page.getByRole('button', { name: /^Retry$/ });
  await expect(retryButton).toBeVisible({ timeout: 15_000 });
  expect(capturedBodies[0]?.model).toBe(EXPECTED_MODEL);
  expect(capturedBodies[0]?.reasoningEffort).toBe(EXPECTED_REASONING);
  expect(String(capturedBodies[0]?.prompt ?? '')).toContain('Drop rows with missing values and continue.');

  await retryButton.click();

  await expect(page.getByText('Recovered after retry.')).toBeVisible({ timeout: 15_000 });
  expect(workflowRequestCount).toBe(2);
  expect(capturedBodies[1]?.model).toBe(EXPECTED_MODEL);
  expect(capturedBodies[1]?.reasoningEffort).toBe(EXPECTED_REASONING);
  expect(capturedBodies[1]?.prompt).toBe('Drop rows with missing values and continue.');
});
