/**
 * Golden-path smoke test — register a user, seed auth + project +
 * dataset via the backend API, then navigate every phase route in
 * the browser and assert the PhaseErrorBoundary fallback does NOT
 * render.
 *
 * Works against BOTH:
 *   - the benchmark preview (`npm run benchmark` → backend:4000 +
 *     preview:4173)
 *   - a live dev stack (`npm run dev` + `--config
 *     playwright.live-dev.config.ts` → backend:4000 + vite:5173)
 *
 * Scope: auth + navigation + render only. Exercising the LLM
 * workflow end-to-end (real OpenAI calls + Docker Python runtime)
 * is out of scope for a fast smoke.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { getApiBase } from '../helpers';

const API_BASE = getApiBase();
const testDir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATASET_PATH = path.resolve(testDir, '../fixtures', 'sample_customers.csv');

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

const PHASES: readonly string[] = [
  'upload',
  'data-viewer',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments',
  'deployment',
];

async function registerTestUser(request: APIRequestContext): Promise<AuthResponse> {
  const email = `playwright-${randomUUID()}@automl.test`;
  const res = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'Playwright2026!', name: 'Playwright Smoke' },
  });
  if (!res.ok()) throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

async function createProject(request: APIRequestContext, accessToken: string): Promise<ApiProject> {
  const res = await request.post(`${API_BASE}/projects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      name: `Smoke Full Path ${randomUUID().slice(0, 8)}`,
      metadata: {
        unlockedPhases: [...PHASES],
        completedPhases: [],
        currentPhase: 'data-viewer',
      },
    },
  });
  if (!res.ok()) throw new Error(`project failed: ${res.status()} ${await res.text()}`);
  return ((await res.json()) as { project: ApiProject }).project;
}

async function uploadDataset(request: APIRequestContext, accessToken: string, projectId: string) {
  const res = await request.post(`${API_BASE}/upload/dataset`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    multipart: {
      projectId,
      file: {
        name: 'sample_customers.csv',
        mimeType: 'text/csv',
        buffer: readFileSync(SAMPLE_DATASET_PATH),
      },
    },
  });
  if (!res.ok()) throw new Error(`upload failed: ${res.status()} ${await res.text()}`);
}

async function seedAuth(page: Page, auth: AuthResponse, project: ApiProject) {
  await page.addInitScript(({ a, p }) => {
    localStorage.clear();
    sessionStorage.clear();
    // Force email_verified=true to bypass the /verify-email/pending gate
    // in ProtectedRoute.tsx:86. New users registered via API have
    // email_verified=false by default; a smoke test doesn't need the
    // email-link round-trip — the backend still accepts the JWT for
    // /api/* calls regardless of client-side gating.
    const verifiedUser = { ...a.user, email_verified: true };
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        accessToken: a.accessToken,
        refreshToken: a.refreshToken,
        user: verifiedUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
      version: 1,
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
          currentPhase: 'data-viewer',
          metadata: p.metadata ?? {},
        }],
        activeProjectId: p.id,
      },
      version: 3,
    }));
  }, { a: auth, p: project });
}

async function expectNoPhaseErrorBoundary(page: Page) {
  const fallback = page.getByText('Something went wrong in this phase.', { exact: false });
  await expect(fallback).toHaveCount(0);
}

test('every phase route renders without the PhaseErrorBoundary fallback', async ({ page, request }) => {
  const auth = await registerTestUser(request);
  const project = await createProject(request, auth.accessToken);
  await uploadDataset(request, auth.accessToken, project.id);
  await seedAuth(page, auth, project);

  // Intercept /api/auth/me so useAuthBootstrap.ts doesn't overwrite the
  // seeded user with the backend's unverified one. Smoke test only — real
  // email-verification flow is out of scope here.
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { ...auth.user, email_verified: true } }),
    });
  });

  for (const phase of PHASES) {
    await test.step(`phase: ${phase}`, async () => {
      await page.goto(`/project/${project.id}/${phase}`);
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => { /* some phases keep a WS open */ });
      await expectNoPhaseErrorBoundary(page);
      await expect(page).toHaveURL(new RegExp(`/project/${project.id}/${phase}`));
    });
  }
});
