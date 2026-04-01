import { describe, expect, it } from 'vitest';

import type { DatasetProfile } from '../../../types/dataset.js';

import type { PreprocessingControllerSummary } from './controller.js';
import { buildPreprocessingActionRequest } from './requestBuilder.js';

const dataset: DatasetProfile = {
  datasetId: 'ds-1',
  projectId: 'project-1',
  filename: 'train.csv',
  fileType: 'csv',
  size: 1024,
  nRows: 50,
  nCols: 3,
  columns: [
    { name: 'age', dtype: 'integer', nullCount: 0 },
    { name: 'income', dtype: 'float', nullCount: 3 },
    { name: 'churn', dtype: 'integer', nullCount: 0 }
  ],
  sample: [
    { age: 30, income: 50000, churn: 0 }
  ],
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z'
};

describe('buildPreprocessingActionRequest', () => {
  it('builds a validate-state request with only the allowed tool definitions', () => {
    const summary: PreprocessingControllerSummary = {
      threadId: 'prep-thread:test:validate-request',
      runId: 'prep-run-1',
      turnMode: 'action_required',
      currentNode: 'validate',
      allowedTools: ['validate_step_result', 'profile_active_dataset', 'read_cell'],
      allowTextResponse: false,
      requireToolCall: true,
      pendingApproval: false,
      activeStepId: 'step-1',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };

    const request = buildPreprocessingActionRequest({
      dataset,
      prompt: 'Validate the executed preprocessing step.',
      projectPlan: 'Keep row counts stable unless the user explicitly approves a drop.',
      ragSnippets: [
        { filename: 'playbook.md', snippet: 'Mention row-count checks before committing.' }
      ],
      toolResults: [
        {
          id: 'tool-result-1',
          tool: 'execute_transformation_step',
          output: { status: 'running' }
        }
      ]
    }, summary);

    expect(request.toolChoice).toBe('any');
    expect(request.tools?.map((tool) => tool.name)).toEqual([
      'validate_step_result',
      'profile_active_dataset',
      'read_cell'
    ]);
    expect(request.messages[0]?.content).toContain(
      'Your next action should validate the executed step and decide whether approval is required.'
    );
    expect(request.messages[1]?.content).toContain('RAG snippets:\n1. playbook.md: Mention row-count checks before committing.');
  });
});
