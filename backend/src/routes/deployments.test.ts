import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeploymentCreateError } from '../services/deploymentErrors.js';
import type { AuthRequest } from '../types/auth.js';
import type { DeploymentRecord } from '../types/deployment.js';

const {
  mockDeployModel,
} = vi.hoisted(() => ({
  mockDeployModel: vi.fn(),
}));

vi.mock('../repositories/deploymentRepository.js', () => ({
  createDeploymentRepository: vi.fn(() => ({})),
}));

vi.mock('../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => ({})),
}));

vi.mock('../repositories/modelRepository.js', () => ({
  createModelRepository: vi.fn(() => ({})),
}));

vi.mock('../services/deploymentManager.js', () => ({
  deployModel: mockDeployModel,
}));

import { createDeploymentsRouter } from './deployments.js';

function makeDeployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  return {
    deploymentId: 'deployment-1',
    modelId: 'model-1',
    projectId: 'project-1',
    name: 'Seeded Deployment',
    status: 'healthy',
    port: 55001,
    endpointUrl: 'http://127.0.0.1:55001',
    config: {},
    createdAt: new Date('2026-04-22T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-04-22T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function getCreateDeploymentHandler() {
  const router = createDeploymentsRouter() as unknown as {
    stack: Array<{
      route?: {
        path?: string;
        methods?: Record<string, boolean>;
        stack?: Array<{ handle: (req: AuthRequest, res: MockResponse, next: (error?: unknown) => void) => void }>;
      };
    }>;
  };
  const layer = router.stack.find((entry) => entry.route?.path === '/' && entry.route?.methods?.post);
  const handler = layer?.route?.stack?.[0]?.handle;
  if (!handler) {
    throw new Error('POST /deployments handler not found');
  }
  return handler;
}

type MockResponse = {
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

async function invokeCreateDeployment(body: Record<string, unknown>) {
  const handler = getCreateDeploymentHandler();

  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    let statusCode = 200;
    const res: MockResponse = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        resolve({ status: statusCode, body: payload });
        return this;
      },
    };

    const req = {
      body,
      protocol: 'http',
      get(header: string) {
        return header.toLowerCase() === 'host' ? 'localhost:4000' : undefined;
      },
    } as AuthRequest;

    handler(req, res, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ status: statusCode, body: undefined });
    });
  });
}

describe('deployment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 with deployment payload on success', async () => {
    mockDeployModel.mockResolvedValue(makeDeployment());

    const response = await invokeCreateDeployment({
      modelId: 'model-1',
      projectId: 'project-1',
      name: 'Seeded Deployment',
    });

    expect(response.status).toBe(201);
    expect(mockDeployModel).toHaveBeenCalledWith('model-1', 'project-1', 'Seeded Deployment');
    expect(response.body).toMatchObject({
      deployment: expect.objectContaining({
        deploymentId: 'deployment-1',
        modelId: 'model-1',
        projectId: 'project-1',
        name: 'Seeded Deployment',
        status: 'healthy',
      }),
    });
  });

  it('returns 404 when model is missing', async () => {
    mockDeployModel.mockRejectedValue(new DeploymentCreateError('MODEL_NOT_FOUND', 'Model not found'));

    const response = await invokeCreateDeployment({
      modelId: 'missing-model',
      projectId: 'project-1',
      name: 'Seeded Deployment',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Model not found' });
  });

  it('returns 404 when model belongs to a different project', async () => {
    mockDeployModel.mockRejectedValue(new DeploymentCreateError('MODEL_PROJECT_MISMATCH', 'Model not found'));

    const response = await invokeCreateDeployment({
      modelId: 'model-1',
      projectId: 'project-1',
      name: 'Seeded Deployment',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Model not found' });
  });

  it('returns 400 when task type is not deployable', async () => {
    mockDeployModel.mockRejectedValue(
      new DeploymentCreateError(
        'INELIGIBLE_TASK_TYPE',
        'Model task type "clustering" is not eligible for deployment (requires classification or regression)',
      ),
    );

    const response = await invokeCreateDeployment({
      modelId: 'model-1',
      projectId: 'project-1',
      name: 'Seeded Deployment',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Model task type "clustering" is not eligible for deployment (requires classification or regression)',
    });
  });

  it('returns 400 when artifact metadata is invalid or missing', async () => {
    mockDeployModel.mockRejectedValue(
      new DeploymentCreateError('INVALID_ARTIFACT', 'Model artifact path must stay within deployment storage'),
    );

    const response = await invokeCreateDeployment({
      modelId: 'model-1',
      projectId: 'project-1',
      name: 'Seeded Deployment',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Model artifact path must stay within deployment storage' });
  });

  it('returns 409 when the project is already at the deployment limit', async () => {
    mockDeployModel.mockRejectedValue(
      new DeploymentCreateError('DEPLOYMENT_LIMIT_REACHED', 'Deployment limit reached: max 5 active deployments per project'),
    );

    const response = await invokeCreateDeployment({
      modelId: 'model-1',
      projectId: 'project-1',
      name: 'Seeded Deployment',
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Deployment limit reached: max 5 active deployments per project',
    });
  });

  it('returns a specific runtime failure instead of a generic internal error', async () => {
    mockDeployModel.mockRejectedValue(
      new DeploymentCreateError('RUNTIME_FAILURE', 'Inference container exited with code 3: Application startup failed'),
    );

    const response = await invokeCreateDeployment({
      modelId: 'model-1',
      projectId: 'project-1',
      name: 'Seeded Deployment',
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Inference container exited with code 3: Application startup failed',
    });
  });
});
