import { describe, expect, it, vi } from 'vitest';

import type { FeaturePipelineRunState } from '../../../repositories/featurePipelineRunRepository.js';
import { registerFeature } from './registrationTools.js';

function buildRun(overrides: Partial<FeaturePipelineRunState['features']['feat-1']> = {}): FeaturePipelineRunState {
  return {
    runId: 'feat-run-1',
    projectId: 'project-1',
    features: {
      'feat-1': {
        featureId: 'feat-1',
        name: 'feat_1',
        method: 'custom',
        status: 'validated',
        // Populate actionable code + outputColumns by default so happy-path
        // tests pass the new defense-in-depth guards. Override per-test for
        // edge cases.
        code: "df['feat_1'] = df['value'] * 2",
        outputColumns: ['feat_1'],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
        ...overrides
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

  describe('defense-in-depth content guards', () => {
    it('rejects registration when stored code is a placeholder comment', async () => {
      // Simulates the state after materialize guard was bypassed or corrupted
      const run = buildRun({
        code: '# Placeholder: materialization deferred until proposal confirmation\n'
      });
      const save = vi.fn(async () => undefined);
      const result = await registerFeature({
        projectId: 'project-1',
        toolCallId: 'call-1',
        args: { featureId: 'feat-1' },
        run,
        runRepository: { save } as never
      });
      expect(result.error).toMatch(/empty or placeholder-only code/);
      expect(run.features['feat-1'].status).toBe('validated'); // NOT registered
      expect(save).not.toHaveBeenCalled();
    });

    it('rejects registration when stored code is whitespace only', async () => {
      const run = buildRun({ code: '   \n\t  ' });
      const result = await registerFeature({
        projectId: 'project-1',
        toolCallId: 'call-1',
        args: { featureId: 'feat-1' },
        run,
        runRepository: { save: vi.fn() } as never
      });
      expect(result.error).toMatch(/empty or placeholder-only code/);
    });

    it('rejects registration when outputColumns is empty', async () => {
      const run = buildRun({ outputColumns: [] });
      const result = await registerFeature({
        projectId: 'project-1',
        toolCallId: 'call-1',
        args: { featureId: 'feat-1' },
        run,
        runRepository: { save: vi.fn() } as never
      });
      expect(result.error).toMatch(/empty outputColumns/);
    });

    it('rejects registration when outputColumns contains "placeholder" literal', async () => {
      const run = buildRun({ outputColumns: ['placeholder'] });
      const result = await registerFeature({
        projectId: 'project-1',
        toolCallId: 'call-1',
        args: { featureId: 'feat-1' },
        run,
        runRepository: { save: vi.fn() } as never
      });
      expect(result.error).toMatch(/placeholder output column names/);
    });

    it('rejection approved=false path skips content guards (user can reject a bad feature)', async () => {
      const run = buildRun({ code: '# bad\n' });
      const save = vi.fn(async () => undefined);
      const result = await registerFeature({
        projectId: 'project-1',
        toolCallId: 'call-1',
        args: { featureId: 'feat-1', approved: false, rejectionReason: 'cleanup' },
        run,
        runRepository: { save } as never
      });
      // approved=false — content guards don't apply, rejection succeeds
      expect(result.error).toBeUndefined();
      expect(run.features['feat-1'].status).toBe('rejected');
    });
  });
});
