import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canListen } from '../tests/canListen.js';

import { createLlmRouter } from './llm.js';

const { datasetGetByIdMock, projectGetByIdMock } = vi.hoisted(() => ({
  datasetGetByIdMock: vi.fn(),
  projectGetByIdMock: vi.fn()
}));

vi.mock('../services/llm/llmClient.js', () => {
  const client = {
    complete: vi.fn(async () => ''),
    stream: vi.fn(async () => '')
  };
  return {
    createLlmClient: vi.fn(() => client),
    createThinkingLlmClient: vi.fn(() => client)
  };
});

vi.mock('../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => ({
    getById: datasetGetByIdMock,
    listByProjectId: vi.fn(async () => [])
  })),
  datasetRepository: {
    getById: datasetGetByIdMock,
    listByProjectId: vi.fn(async () => [])
  }
}));

vi.mock('../repositories/projectRepository.js', () => ({
  createProjectRepository: vi.fn(() => ({
    getById: projectGetByIdMock
  })),
  projectRepository: {
    getById: projectGetByIdMock
  }
}));

vi.mock('../services/mcp/mcpAdapter.js', () => ({
  listMcpToolsForLlm: vi.fn(async () => []),
  executeMcpTool: vi.fn(async () => ({ output: {} }))
}));

vi.mock('../services/rag/searchService.js', () => ({
  searchDocuments: vi.fn(async () => [])
}));

vi.mock('../services/documentSearchService.js', () => ({
  searchDocuments: vi.fn(async () => [])
}));

const canBind = await canListen();
const describeIf = canBind ? describe : describe.skip;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createLlmRouter());
  return app;
}

describeIf('llm routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    datasetGetByIdMock.mockResolvedValue({
      datasetId: 'ds-1',
      filename: 'train.csv',
      profile: {
        nRows: 10,
        nCols: 2,
        dtypes: { age: 'int64', churn: 'int64' },
        nullCounts: { age: 0, churn: 0 }
      },
      sample: [{ age: 21, churn: 0 }]
    });
    projectGetByIdMock.mockResolvedValue({
      projectId: 'project-1',
      metadata: {}
    });
  });

  describe('POST /api/llm/onboarding/stream', () => {
    it('returns 400 when projectId is missing', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/onboarding/stream')
        .send({
          userIntent: 'Predict churn',
          round: 0
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('returns 400 when round is out of bounds', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/onboarding/stream')
        .send({
          projectId: 'project-1',
          round: 6
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });
  });

  describe('POST /api/llm/training/stream', () => {
    it('returns 409 when FE approval is required but no pipeline is approved', async () => {
      projectGetByIdMock.mockResolvedValue({
        projectId: 'project-1',
        metadata: {
          feWorkflowVersion: 2,
          pipelineVersions: [
            { id: 'v1', status: 'draft' },
            { id: 'v0', status: 'deprecated' }
          ]
        }
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/training/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'Train churn model'
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('FE_PIPELINE_APPROVAL_REQUIRED');
      expect(response.body.error).toContain('approved feature engineering pipeline');
    });
  });
});
