import { describe, expect, it, vi } from 'vitest';

import type { FeaturePipelineRunState } from '../../../repositories/featurePipelineRunRepository.js';
import { registerFeature } from './registrationTools.js';

function buildRun(): FeaturePipelineRunState {
  return {
    runId: 'feat-run-1',
    projectId: 'project-1',
    features: {
      'feat-1': {
        featureId: 'feat-1',
        name: 'feat_1',
        method: 'custom',
        status: 'validated',
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z'
      }
    },
    createdAt: '2026-04-04T00:00:00.000Z',
    updatedAt: '2026-04-04T00:00:00.000Z'
  };
}

describe('registerFeature', () => {
  it('includes projectId in successful register output', async () => {
    const run = buildRun();
    const save = vi.fn(async () => undefined);

    const result = await registerFeature({
      projectId: 'project-1',
      toolCallId: 'call-1',
      args: { featureId: 'feat-1' },
      run,
      runRepository: { save } as never
    });

    expect(result).toEqual({
      output: expect.objectContaining({
        status: 'ok',
        featureId: 'feat-1',
        projectId: 'project-1'
      })
    });
  });

  it('includes projectId in rejected register output', async () => {
    const run = buildRun();
    const save = vi.fn(async () => undefined);

    const result = await registerFeature({
      projectId: 'project-1',
      toolCallId: 'call-1',
      args: { featureId: 'feat-1', approved: false, rejectionReason: 'manual reject' },
      run,
      runRepository: { save } as never
    });

    expect(result).toEqual({
      output: expect.objectContaining({
        status: 'rejected',
        featureId: 'feat-1',
        projectId: 'project-1',
        rejectionReason: 'manual reject'
      })
    });
  });
});
