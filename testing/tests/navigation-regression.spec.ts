import { expect, test, type APIRequestContext, type Locator, type Page, type Request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { getApiBase, resetBackendData } from '../helpers';

const API_BASE = getApiBase();
const testDir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATASET_PATH = path.resolve(testDir, '../fixtures/sample_customers.csv');

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

interface HoverSample {
  iconId: string | null;
  chevronId: string | null;
  tooltipTexts: string[];
}

interface RequestLogEntry {
  method: string;
  path: string;
  timestamp: number;
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
      name: `Navigation Regression ${randomUUID()}`,
      metadata: {
        unlockedPhases: ['upload', 'data-viewer'],
        completedPhases: [],
        currentPhase: 'data-viewer',
      },
    },
  });

  if (!response.ok()) {
    throw new Error(`Project creation failed: ${response.status()} ${await response.text()}`);
  }

  return (await response.json()) as { project: ApiProject };
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

async function seedAuth(page: Page, auth: AuthResponse, project: ApiProject) {
  await page.addInitScript(
    ({ authState, persistedProject }) => {
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
          projects: [persistedProject],
          activeProjectId: persistedProject.id,
        },
        version: 3,
      }));
    },
    {
      authState: auth,
      persistedProject: {
        id: project.id,
        title: project.name,
        description: project.description ?? '',
        icon: project.icon ?? 'Folder',
        color: project.color ?? 'blue',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        unlockedPhases: Array.isArray(project.metadata?.unlockedPhases) ? project.metadata.unlockedPhases : ['upload', 'data-viewer'],
        completedPhases: Array.isArray(project.metadata?.completedPhases) ? project.metadata.completedPhases : [],
        currentPhase: typeof project.metadata?.currentPhase === 'string' ? project.metadata.currentPhase : 'data-viewer',
        metadata: project.metadata ?? {},
      },
    }
  );
}

async function samplePhaseHover(
  page: Page,
  phase: 'upload' | 'data-viewer',
  target: Locator,
  durationMs = 1_200,
  intervalMs = 60
): Promise<HoverSample[]> {
  await target.hover();

  const endAt = Date.now() + durationMs;
  const samples: HoverSample[] = [];

  while (Date.now() < endAt) {
    const sample = await page.evaluate((phaseName) => {
      const row = document.querySelector(`[data-testid="workflow-phase-${phaseName}"]`);
      const icon = row?.querySelector(`[data-testid="workflow-phase-icon-${phaseName}"]`) as HTMLElement | null;
      const chevron = row?.querySelector(`[data-testid="workflow-phase-chevron-${phaseName}"]`) as HTMLElement | null;

      if (icon && !icon.dataset.probeId) {
        icon.dataset.probeId = crypto.randomUUID();
      }
      if (chevron && !chevron.dataset.probeId) {
        chevron.dataset.probeId = crypto.randomUUID();
      }

      return {
        iconId: icon?.dataset.probeId ?? null,
        chevronId: chevron?.dataset.probeId ?? null,
        tooltipTexts: Array.from(document.querySelectorAll('[role="tooltip"]'))
          .map((node) => node.textContent?.trim() ?? '')
          .filter(Boolean),
      };
    }, phase);

    samples.push(sample);
    await page.waitForTimeout(intervalMs);
  }

  return samples;
}

test('upload and explorer toggles stay stable across repeated round-trips', async ({ page, request }) => {
  await resetBackendData(request);

  const auth = await registerTestUser(request);
  const createdProject = await createProject(request, auth.accessToken);
  const projectId = createdProject.project.id;
  await uploadDataset(request, auth.accessToken, projectId);

  await seedAuth(page, auth, createdProject.project);

  const requestLog: RequestLogEntry[] = [];
  const requestListener = (req: Request) => {
    const url = new URL(req.url());
    if (!url.pathname.startsWith('/api/')) return;
    if (url.pathname.startsWith('/api/auth/')) return;
    requestLog.push({
      method: req.method(),
      path: `${url.pathname}${url.search}`,
      timestamp: Date.now(),
    });
  };
  page.on('request', requestListener);

  try {
    await page.goto(`/project/${projectId}/upload`);
    await expect(page.locator('[data-testid="upload-area"]')).toBeVisible({ timeout: 15_000 });

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const cycleStart = requestLog.length;

      const explorerStartedAt = Date.now();
      await page.getByRole('button', { name: /^Explorer$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/data-viewer$`));
      await expect(page.locator('table').first()).toBeVisible({ timeout: 15_000 });
      const explorerElapsedMs = Date.now() - explorerStartedAt;
      await page.waitForTimeout(900);

      const uploadStartedAt = Date.now();
      await page.getByRole('button', { name: /^Data Upload$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/upload$`));
      await expect(page.locator('[data-testid="upload-area"]')).toBeVisible();
      const uploadElapsedMs = Date.now() - uploadStartedAt;
      const uploadSettledAt = Date.now();
      await page.waitForTimeout(900);

      const cycleRequests = requestLog.slice(cycleStart);
      const uploadTrailingRequests = cycleRequests.filter((entry) => entry.timestamp > uploadSettledAt);
      expect(uploadTrailingRequests).toEqual([]);

      const datasetRequests = cycleRequests.filter((entry) => entry.path.startsWith('/api/datasets'));
      const documentRequests = cycleRequests.filter((entry) => entry.path.startsWith('/api/documents'));
      const projectPatches = cycleRequests.filter(
        (entry) => entry.method === 'PATCH' && entry.path.startsWith(`/api/projects/${projectId}`)
      );
      const otherRequests = cycleRequests.filter(
        (entry) => !entry.path.startsWith('/api/datasets') && !entry.path.startsWith('/api/documents') && !entry.path.startsWith(`/api/projects/${projectId}`)
      );

      expect(uploadElapsedMs).toBeLessThan(1_500);
      expect(explorerElapsedMs).toBeLessThan(1_500);
      expect(datasetRequests).toHaveLength(0);
      expect(documentRequests).toHaveLength(0);
      expect(projectPatches.length).toBeLessThanOrEqual(2);
      expect(otherRequests.length).toBeLessThanOrEqual(2);
    }

    await page.getByRole('button', { name: /^Explorer$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/data-viewer$`));
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15_000 });

    const explorerRow = page.getByTestId('workflow-phase-data-viewer');
    await explorerRow.hover();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    const explorerSamples = await samplePhaseHover(page, 'data-viewer', explorerRow);
    expect(new Set(explorerSamples.map((sample) => sample.iconId)).size).toBe(1);
    expect(new Set(explorerSamples.map((sample) => sample.chevronId)).size).toBe(1);
    expect(explorerSamples.every((sample) => sample.tooltipTexts.length === 0)).toBeTruthy();

    const uploadRow = page.getByTestId('workflow-phase-upload');
    const uploadSamples = await samplePhaseHover(page, 'upload', uploadRow);
    expect(new Set(uploadSamples.map((sample) => sample.iconId)).size).toBe(1);
    expect(new Set(uploadSamples.map((sample) => sample.chevronId)).size).toBe(1);
    expect(uploadSamples.every((sample) => sample.tooltipTexts.length === 0)).toBeTruthy();
  } finally {
    page.off('request', requestListener);
  }
});
