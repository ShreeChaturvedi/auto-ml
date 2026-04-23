import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockDeployModel: vi.fn(),
  mockDeploymentRepo: {
    listByProject: vi.fn(),
    getById: vi.fn(),
    getPredictionLogs: vi.fn(),
    getHourlyStats: vi.fn(),
    createApiKey: vi.fn(),
    listApiKeys: vi.fn(),
    revokeApiKey: vi.fn(),
    updatePredictionFeedback: vi.fn(),
  },
}));

vi.mock('../config.js', () => ({
  env: {
    datasetMetadataPath: '/tmp/test-datasets.json',
    modelMetadataPath: '/tmp/test-models.json',
  },
}));

vi.mock('../repositories/deploymentRepository.js', () => ({
  createDeploymentRepository: () => hoisted.mockDeploymentRepo,
}));

vi.mock('../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    getById: vi.fn(),
  }),
}));

vi.mock('../repositories/modelRepository.js', () => ({
  createModelRepository: () => ({
    getById: vi.fn(),
  }),
}));

vi.mock('../middleware/requireDeploymentOwnership.js', () => ({
  requireDeploymentOwnership: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../services/deploymentManager.js', () => ({
  deployModel: hoisted.mockDeployModel,
  deleteDeployment: vi.fn(),
  stopDeployment: vi.fn(),
  startDeployment: vi.fn(),
}));

const { createDeploymentsRouter } = await import('./deployments.js');

type RouterLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: unknown, res: unknown, next: (error?: unknown) => void) => unknown }>;
  };
};

function getCreateDeploymentHandler() {
  const router = createDeploymentsRouter() as unknown as { stack: RouterLayer[] };
  const routeLayer = router.stack.find((layer) => layer.route?.path === '/' && layer.route.methods.post);
  if (!routeLayer?.route?.stack[0]) {
    throw new Error('Expected POST / deployment handler to be registered');
  }
  return routeLayer.route.stack[0].handle;
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('deployment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a clear 400 when deployment schema recovery fails', async () => {
    hoisted.mockDeployModel.mockRejectedValue(
      Object.assign(
        new Error('Model model-1 is missing its deployment schema, and recovery failed: dataset "dataset-1" has no usable feature columns after excluding target column "target".'),
        { statusCode: 400 },
      ),
    );

    const handler = getCreateDeploymentHandler();
    const res = makeRes();
    const next = vi.fn();

    await handler(
      { body: { modelId: 'model-1', projectId: 'project-1', name: 'endpoint' } },
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Model model-1 is missing its deployment schema, and recovery failed: dataset "dataset-1" has no usable feature columns after excluding target column "target".',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
