import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { getApiBase } from '../helpers';

const API_BASE = getApiBase();

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
}

interface UploadFixture {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

async function registerUser(request: APIRequestContext): Promise<AuthResponse> {
  const email = `upload-filetypes-${randomUUID()}@automl.test`;
  const response = await request.post(`${API_BASE}/auth/register`, {
    data: {
      email,
      password: 'UploadFiletypes2026!',
      name: 'Upload Filetypes Bot',
    },
  });

  if (!response.ok()) {
    throw new Error(`Registration failed: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

async function createProject(request: APIRequestContext, accessToken: string): Promise<ApiProject> {
  const response = await request.post(`${API_BASE}/projects`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      name: `Upload Filetype Support ${randomUUID().slice(0, 8)}`,
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

  return ((await response.json()) as { project: ApiProject }).project;
}

async function listDatasets(
  request: APIRequestContext,
  accessToken: string,
  projectId: string,
): Promise<ApiDataset[]> {
  const response = await request.get(`${API_BASE}/datasets?projectId=${encodeURIComponent(projectId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Dataset list failed: ${response.status()} ${await response.text()}`);
  }

  const body = (await response.json()) as { datasets?: ApiDataset[] } | ApiDataset[];
  return Array.isArray(body) ? body : body.datasets ?? [];
}

async function seedAuth(page: Page, auth: AuthResponse, project: ApiProject) {
  await page.addInitScript(({ authState, projectState }) => {
    localStorage.clear();
    sessionStorage.clear();

    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        accessToken: authState.accessToken,
        refreshToken: authState.refreshToken,
        user: {
          ...authState.user,
          email_verified: true,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
      version: 1,
    }));

    localStorage.setItem('automl-projects-storage', JSON.stringify({
      state: {
        projects: [{
          id: projectState.id,
          title: projectState.name,
          description: projectState.description ?? '',
          icon: projectState.icon ?? 'Folder',
          color: projectState.color ?? 'blue',
          createdAt: projectState.createdAt,
          updatedAt: projectState.updatedAt,
          currentPhase: 'upload',
          unlockedPhases: ['upload', 'data-viewer'],
          completedPhases: [],
          metadata: projectState.metadata ?? {
            currentPhase: 'upload',
            unlockedPhases: ['upload', 'data-viewer'],
            completedPhases: [],
          },
        }],
        activeProjectId: projectState.id,
      },
      version: 3,
    }));
  }, {
    authState: auth,
    projectState: project,
  });
}

test('upload page accepts TSV, JSONL, and NDJSON as dataset uploads on live dev', async ({ page, request }) => {
  test.setTimeout(120_000);

  const auth = await registerUser(request);
  const project = await createProject(request, auth.accessToken);
  await seedAuth(page, auth, project);

  const uploadRequests: string[] = [];
  const requestListener = (req: Request) => {
    const url = new URL(req.url());
    if (url.pathname === '/api/upload/dataset' || url.pathname === '/api/upload/doc') {
      uploadRequests.push(url.pathname);
    }
  };

  page.on('request', requestListener);

  try {
    await page.goto(`/project/${project.id}/upload`);
    await expect(page.getByTestId('upload-area')).toBeVisible();

    const accept = await page.locator('#data-upload-input').getAttribute('accept');
    expect(accept).toContain('.tsv');
    expect(accept).toContain('.jsonl');
    expect(accept).toContain('.ndjson');

    const fixtures: UploadFixture[] = [
      {
        name: 'regional-sales.tsv',
        mimeType: 'text/tab-separated-values',
        buffer: Buffer.from('region\trevenue\nNorth\t120\nSouth\t95\n', 'utf8'),
      },
      {
        name: 'events.jsonl',
        mimeType: 'application/x-ndjson',
        buffer: Buffer.from('{"id":1,"event":"signup"}\n{"id":2,"event":"purchase"}\n', 'utf8'),
      },
      {
        name: 'metrics.ndjson',
        mimeType: 'application/x-ndjson',
        buffer: Buffer.from('{"id":1,"score":0.91}\n{"id":2,"score":0.84}\n', 'utf8'),
      },
    ];

    for (const fixture of fixtures) {
      await expect(page.getByTestId('upload-area')).toBeVisible();
      const fileInput = page.locator('#data-upload-input');
      await expect(fileInput).toHaveCount(1);
      await fileInput.setInputFiles([]);

      const datasetUploadCount = uploadRequests.filter((path) => path === '/api/upload/dataset').length;
      const documentUploadCount = uploadRequests.filter((path) => path === '/api/upload/doc').length;

      const responsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === '/api/upload/dataset'
          && response.request().method() === 'POST';
      });

      await fileInput.setInputFiles({
        name: fixture.name,
        mimeType: fixture.mimeType,
        buffer: fixture.buffer,
      });

      const uploadResponse = await responsePromise;
      expect(uploadResponse.ok()).toBe(true);

      await expect(page.getByText(fixture.name, { exact: true })).toBeVisible();

      await expect.poll(async () => {
        const datasets = await listDatasets(request, auth.accessToken, project.id);
        return datasets.some((dataset) => dataset.filename === fixture.name);
      }).toBe(true);

      expect(uploadRequests.filter((path) => path === '/api/upload/dataset')).toHaveLength(datasetUploadCount + 1);
      expect(uploadRequests.filter((path) => path === '/api/upload/doc')).toHaveLength(documentUploadCount);
    }
  } finally {
    page.off('request', requestListener);
  }
});
