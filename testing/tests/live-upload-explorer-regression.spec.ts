import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { getApiBase } from '../helpers';

const API_BASE = getApiBase();
const testDir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATASET_PATH = path.resolve(testDir, '../fixtures/sample_customers.csv');

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

interface ApiRequestLogEntry {
  time: number;
  method: string;
  path: string;
}

async function registerTestUser(request: APIRequestContext): Promise<AuthResponse> {
  const email = `playwright-live-${randomUUID()}@automl.test`;
  const password = 'Playwright2026!';

  const response = await request.post(`${API_BASE}/auth/register`, {
    data: {
      email,
      password,
      name: 'Playwright Live Bot',
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
      name: `Live Navigation Regression ${randomUUID()}`,
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
          projects: [
            {
              id: activeProjectId,
              title: 'Seeded Live Project',
              description: 'Playwright live dev seed',
              icon: 'Folder',
              color: 'blue',
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              currentPhase: 'data-viewer',
              unlockedPhases: ['upload', 'data-viewer'],
              completedPhases: [],
              metadata: {
                currentPhase: 'data-viewer',
                unlockedPhases: ['upload', 'data-viewer'],
                completedPhases: [],
              },
            },
          ],
          activeProjectId,
        },
        version: 3,
      }));
    },
    { authState: auth, activeProjectId: projectId }
  );
}

async function collectHoverSamples(page: Page, label: 'Explorer' | 'Data Upload', phase: 'data-viewer' | 'upload') {
  const target = page.locator(`[data-testid="workflow-phase-${phase}"]`);
  const icon = page.locator(`[data-testid="workflow-phase-icon-${phase}"]`).first();
  const chevron = page.locator(`[data-testid="workflow-phase-chevron-${phase}"]`).first();

  await target.hover();
  await page.waitForTimeout(450);

  const tooltipStates = new Set<string>();
  const iconColors = new Set<string>();
  const chevronColors = new Set<string>();

  const startedAt = Date.now();
  while (Date.now() - startedAt < 800) {
    tooltipStates.add((await page.getByRole('tooltip').allTextContents()).join('|'));
    iconColors.add(await icon.evaluate((element) => getComputedStyle(element).color));
    chevronColors.add(await chevron.evaluate((element) => getComputedStyle(element).color));
    await page.waitForTimeout(50);
  }

  return {
    tooltipStates: Array.from(tooltipStates),
    iconColors: Array.from(iconColors),
    chevronColors: Array.from(chevronColors),
  };
}

test('upload/explorer switching stays stable on the live dev frontend', async ({ page, request }) => {
  const auth = await registerTestUser(request);
  const createdProject = await createProject(request, auth.accessToken);
  const projectId = createdProject.project.id;
  await uploadDataset(request, auth.accessToken, projectId);

  await seedAuth(page, auth, projectId);

  const requestLog: ApiRequestLogEntry[] = [];
  const requestListener = (req: Request) => {
    const url = new URL(req.url());
    if (url.origin !== 'http://127.0.0.1:4000' && url.origin !== 'http://localhost:4000') {
      return;
    }

    requestLog.push({
      time: Date.now(),
      method: req.method(),
      path: `${url.pathname}${url.search}`,
    });
  };
  page.on('request', requestListener);

  try {
    await page.goto(`/project/${projectId}/data-viewer`);
    await page.getByRole('button', { name: /sample_customers\.csv/i }).first().click();
    await expect(page.getByRole('table')).toBeVisible();
    await page.waitForTimeout(1_000);

    requestLog.length = 0;

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const cycleStart = requestLog.length;

      await page.getByRole('button', { name: /^Data Upload$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/upload$`));
      await expect(page.locator('[data-testid="upload-area"]')).toBeVisible();
      await page.waitForTimeout(900);

      const visibleStartedAt = Date.now();
      await page.getByRole('button', { name: /^Explorer$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/data-viewer$`));
      await expect(page.getByRole('table')).toBeVisible();
      const visibleElapsedMs = Date.now() - visibleStartedAt;

      const settledWindowStart = Date.now();
      await page.waitForTimeout(1_000);

      const cycleRequests = requestLog.slice(cycleStart);
      const settledRequests = cycleRequests.filter((entry) => entry.time >= settledWindowStart);
      const perPathCounts = cycleRequests.reduce<Record<string, number>>((counts, entry) => {
        const key = `${entry.method} ${entry.path}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      const maxDuplicateCount = Math.max(0, ...Object.values(perPathCounts));

      expect(visibleElapsedMs).toBeLessThan(1_500);
      expect(cycleRequests.length).toBeLessThanOrEqual(6);
      expect(maxDuplicateCount).toBeLessThanOrEqual(2);
      expect(settledRequests.length).toBeLessThanOrEqual(1);
    }

    const explorerHover = await collectHoverSamples(page, 'Explorer', 'data-viewer');
    expect(explorerHover.tooltipStates).toEqual(['']);
    expect(explorerHover.iconColors).toHaveLength(1);
    expect(explorerHover.chevronColors).toHaveLength(1);

    const uploadHover = await collectHoverSamples(page, 'Data Upload', 'upload');
    expect(uploadHover.tooltipStates).toHaveLength(1);
    expect(uploadHover.iconColors).toHaveLength(1);
    expect(uploadHover.chevronColors).toHaveLength(1);
  } finally {
    page.off('request', requestListener);
  }
});
