import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { getApiBase, getApiOrigin, getFrontendBase } from '../helpers';

const FRONTEND_BASE = getFrontendBase();
const API_BASE = getApiBase();
const API_ORIGIN = getApiOrigin();
const testDir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATASET_PATH = path.resolve(testDir, '../fixtures/sample_customers.csv');

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

function isProjectPatch(request: { method: string; path: string }, projectId: string) {
  return request.method === 'PATCH' && request.path === `/api/projects/${projectId}`;
}

function isAuthNoise(path: string) {
  return path.startsWith('/api/auth/me') || path.startsWith('/api/auth/refresh');
}

async function registerTestUser(request: APIRequestContext): Promise<AuthResponse> {
  const email = `playwright-${randomUUID()}@automl.test`;
  const password = 'Playwright2026!';

  const response = await request.post(`${API_BASE}/auth/register`, {
    data: {
      email,
      password,
      name: 'Playwright Bot',
    },
  });

  if (!response.ok()) {
    throw new Error(`Registration failed: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

async function createProject(request: APIRequestContext, accessToken: string) {
  const response = await request.post(`${API_BASE}/projects`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      name: `Navigation Stability ${randomUUID()}`,
      metadata: {
        unlockedPhases: ['upload', 'data-viewer'],
        completedPhases: [],
        currentPhase: 'upload',
      },
    },
  });

  if (!response.ok()) {
    throw new Error(`Project creation failed: ${response.status()} ${await response.text()}`);
  }

  return (await response.json()) as { project: { id: string } };
}

async function uploadDataset(
  request: APIRequestContext,
  accessToken: string,
  projectId: string
) {
  const response = await request.post(`${API_BASE}/upload/dataset`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    multipart: {
      projectId,
      file: {
        name: 'sample_customers.csv',
        mimeType: 'text/csv',
        buffer: readFileSync(SAMPLE_DATASET_PATH),
      },
    },
  });

  if (!response.ok()) {
    throw new Error(`Dataset upload failed: ${response.status()} ${await response.text()}`);
  }
}

async function seedAuth(page: Page, auth: AuthResponse, projectId: string) {
  await page.addInitScript(
    ({ authState, activeProjectId }) => {
      localStorage.clear();
      sessionStorage.clear();

      localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          accessToken: authState.accessToken,
          refreshToken: authState.refreshToken,
          user: authState.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
        version: 1,
      }));

      localStorage.setItem('automl-projects-storage', JSON.stringify({
        state: {
          projects: [],
          activeProjectId,
        },
        version: 3,
      }));
    },
    { authState: auth, activeProjectId: projectId }
  );
}

async function sampleStability(page: Page, label: string) {
  const tooltipCounts: number[] = [];
  const indicatorStates: string[] = [];

  await page.getByRole('button', { name: new RegExp(`^${label}$`) }).hover();

  for (let i = 0; i < 20; i += 1) {
    tooltipCounts.push(await page.getByRole('tooltip').count());
    indicatorStates.push(await page.getByTestId(`workflow-phase-chevron-${label === 'Explorer' ? 'data-viewer' : 'upload'}`).evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return `${styles.opacity}|${styles.transform}`;
    }));
    await page.waitForTimeout(50);
  }

  return { tooltipCounts, indicatorStates };
}

test('upload and explorer navigation stays stable in the live dev app', async ({ page, request }) => {
  await request.delete(`${API_BASE.replace(/\/api$/, '')}/api/projects/reset`);

  const auth = await registerTestUser(request);
  const createdProject = await createProject(request, auth.accessToken);
  const projectId = createdProject.project.id;
  await uploadDataset(request, auth.accessToken, projectId);

  await seedAuth(page, auth, projectId);

  const backendRequests: Array<{ method: string; path: string; timestamp: number }> = [];
  const requestListener = (req: Request) => {
    if (req.method() === 'OPTIONS') {
      return;
    }
    const url = new URL(req.url());
    if (url.origin === API_ORIGIN) {
      const path = `${url.pathname}${url.search}`;
      if (isAuthNoise(path)) {
        return;
      }
      backendRequests.push({
        method: req.method(),
        path,
        timestamp: Date.now(),
      });
    }
  };
  page.on('request', requestListener);

  try {
    await page.goto(`${FRONTEND_BASE}/project/${projectId}/data-viewer`);
    await expect(page.getByRole('table')).toBeVisible();
    await page.waitForTimeout(500);

    backendRequests.length = 0;

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const cycleStart = Date.now();

      await page.getByRole('button', { name: /^Data Upload$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/upload$`));
      await expect(page.locator('[data-testid="upload-area"]')).toBeVisible();
      await page.waitForTimeout(400);

      const afterUploadRequests = backendRequests.splice(0);
      expect(afterUploadRequests.filter((request) => isProjectPatch(request, projectId))).toHaveLength(1);
      expect(afterUploadRequests).toHaveLength(1);

      await page.getByRole('button', { name: /^Explorer$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/data-viewer$`));
      await expect(page.getByRole('table')).toBeVisible();
      const explorerVisibleAt = Date.now();
      await page.waitForTimeout(900);

      const afterExplorerRequests = backendRequests.splice(0);
      const datasetRequests = afterExplorerRequests.filter((request) => request.path.startsWith('/api/datasets'));
      const documentRequests = afterExplorerRequests.filter((request) => request.path.startsWith('/api/documents'));
      const patchRequests = afterExplorerRequests.filter((request) => isProjectPatch(request, projectId));
      const notebookRequests = afterExplorerRequests.filter(
        (request) => request.method === 'GET' && request.path === `/api/projects/${projectId}/notebooks`
      );

      expect(Date.now() - explorerVisibleAt).toBeGreaterThanOrEqual(900);
      expect(explorerVisibleAt - cycleStart).toBeLessThan(1_500);
      expect(datasetRequests).toHaveLength(0);
      expect(documentRequests).toHaveLength(0);
      expect(patchRequests).toHaveLength(1);
      expect(notebookRequests.length).toBeLessThanOrEqual(1);
      expect(afterExplorerRequests).toHaveLength(1 + notebookRequests.length);
    }

    const activeExplorer = await sampleStability(page, 'Explorer');
    expect(activeExplorer.tooltipCounts.every((count) => count === 0)).toBe(true);
    expect(new Set(activeExplorer.indicatorStates).size).toBe(1);

    await page.getByRole('button', { name: /^Data Upload$/ }).hover();
    await expect(page.getByRole('button', { name: /^Data Upload$/ })).toBeVisible();
  } finally {
    page.off('request', requestListener);
  }
});
