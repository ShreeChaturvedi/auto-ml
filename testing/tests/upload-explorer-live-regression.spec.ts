import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API_BASE = 'http://127.0.0.1:4000/api';
const testDir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATASET_PATH = path.resolve(testDir, '../fixtures/sample_customers.csv');

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

interface HoverSample {
  triggerId: string | null;
  label: string | null;
  tooltipTexts: string[];
  opacities: string[];
  transforms: string[];
}

async function ensureOk(response: Awaited<ReturnType<APIRequestContext['post']>>, label: string) {
  if (response.ok()) return;
  throw new Error(`${label} failed: ${response.status()} ${await response.text()}`);
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

  await ensureOk(response, 'Registration');
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
        currentPhase: 'data-viewer',
      },
    },
  });

  await ensureOk(response, 'Project creation');
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

  await ensureOk(response, 'Dataset upload');
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

function isBackendRequest(req: Request) {
  const url = new URL(req.url());
  return url.origin === 'http://127.0.0.1:4000' || url.origin === 'http://localhost:4000';
}

async function collectHoverSamples(page: Page, phaseName: string, iterations = 18): Promise<HoverSample[]> {
  const phaseButton = page.getByRole('button', { name: new RegExp(`^${phaseName}$`) });
  await phaseButton.hover();
  await page.waitForTimeout(450);

  const trigger = page.locator(
    `button[aria-label="Expand ${phaseName}"], button[aria-label="Collapse ${phaseName}"]`
  ).first();

  const samples: HoverSample[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const phaseState = await trigger.evaluate((el) => {
      const element = el as HTMLButtonElement & { dataset: DOMStringMap };
      if (!element.dataset.probeId) {
        element.dataset.probeId = String(Math.random());
      }

      const svgs = Array.from(element.querySelectorAll('svg'));
      const iconMetrics = svgs.map((svg) => {
        const computed = window.getComputedStyle(svg);
        return {
          opacity: computed.opacity,
          transform: computed.transform,
        };
      });

      return {
        triggerId: element.dataset.probeId ?? null,
        label: element.getAttribute('aria-label'),
        opacities: iconMetrics.map((metric) => metric.opacity),
        transforms: iconMetrics.map((metric) => metric.transform),
      };
    }).catch(() => ({
      triggerId: null,
      label: null,
      opacities: [],
      transforms: [],
    }));

    const tooltipTexts = await page.getByRole('tooltip').allTextContents();
    samples.push({ ...phaseState, tooltipTexts });
    await page.waitForTimeout(60);
  }

  return samples;
}

test('live dev upload/explorer switching stays stable under repeated cycles', async ({ page, request }) => {
  await request.delete(`${API_BASE}/projects/reset`);

  const auth = await registerTestUser(request);
  const createdProject = await createProject(request, auth.accessToken);
  const projectId = createdProject.project.id;
  await uploadDataset(request, auth.accessToken, projectId);

  await seedAuth(page, auth, projectId);

  const requestLog: Array<{ ts: number; method: string; path: string }> = [];
  const requestListener = (req: Request) => {
    if (!isBackendRequest(req)) return;
    const url = new URL(req.url());
    requestLog.push({
      ts: Date.now(),
      method: req.method(),
      path: `${url.pathname}${url.search}`,
    });
  };
  page.on('request', requestListener);

  try {
    await page.goto(`/project/${projectId}/data-viewer`);
    await expect(page.getByRole('table')).toBeVisible();
    await page.waitForTimeout(800);

    requestLog.length = 0;

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const cycleStart = requestLog.length;

      await page.getByRole('button', { name: /^Data Upload$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/upload$`));
      await expect(page.locator('[data-testid="upload-area"]')).toBeVisible();
      await page.waitForTimeout(500);

      await page.getByRole('button', { name: /^Explorer$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/project/${projectId}/data-viewer$`));
      await expect(page.getByRole('table')).toBeVisible();
      await page.waitForTimeout(1_200);

      const cycleRequests = requestLog.slice(cycleStart);
      const grouped = cycleRequests.reduce<Record<string, number>>((acc, entry) => {
        const key = `${entry.method} ${entry.path}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

      const datasetReads = cycleRequests.filter((entry) => entry.path.startsWith('/api/datasets?'));
      const documentReads = cycleRequests.filter((entry) => entry.path.startsWith('/api/documents?'));
      const projectPatches = cycleRequests.filter((entry) => (
        entry.method === 'PATCH' && entry.path.startsWith(`/api/projects/${projectId}`)
      ));

      expect.soft(cycleRequests.length, `cycle ${cycle + 1} request census`).toBeLessThanOrEqual(8);
      expect.soft(datasetReads.length, `cycle ${cycle + 1} dataset reads`).toBeLessThanOrEqual(1);
      expect.soft(documentReads.length, `cycle ${cycle + 1} document reads`).toBeLessThanOrEqual(1);
      expect.soft(projectPatches.length, `cycle ${cycle + 1} project patches`).toBeLessThanOrEqual(2);
      expect.soft(Object.keys(grouped).length, `cycle ${cycle + 1} unique request paths`).toBeLessThanOrEqual(6);
    }

    const explorerHoverSamples = await collectHoverSamples(page, 'Explorer');
    const explorerTriggerIds = new Set(explorerHoverSamples.map((sample) => sample.triggerId).filter(Boolean));
    const explorerTooltipStates = new Set(
      explorerHoverSamples.map((sample) => sample.tooltipTexts.join('|'))
    );
    const explorerOpacityStates = new Set(
      explorerHoverSamples.map((sample) => sample.opacities.join('|'))
    );

    expect.soft(explorerTriggerIds.size, 'Explorer trigger should not remount while hovered').toBe(1);
    expect.soft(explorerTooltipStates).toEqual(new Set(['']));
    expect.soft(explorerOpacityStates).toEqual(new Set(['1|1']));

    const uploadHoverSamples = await collectHoverSamples(page, 'Data Upload');
    const uploadTriggerIds = new Set(uploadHoverSamples.map((sample) => sample.triggerId).filter(Boolean));
    const uploadTooltipStates = new Set(
      uploadHoverSamples.map((sample) => sample.tooltipTexts.join('|'))
    );
    const uploadOpacityStates = new Set(
      uploadHoverSamples.map((sample) => sample.opacities.join('|'))
    );

    expect.soft(uploadTriggerIds.size, 'Upload trigger should not remount while hovered').toBe(1);
    expect.soft(uploadTooltipStates).toEqual(new Set(['Upload datasets and business context']));
    expect.soft(uploadOpacityStates).toEqual(new Set(['1|1']));
  } finally {
    page.off('request', requestListener);
  }
});
