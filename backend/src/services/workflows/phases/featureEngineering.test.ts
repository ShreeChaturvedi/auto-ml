import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ToolContext } from '../phaseConfig.js';

import { featureEngineeringPhaseConfig, featureRunRepository } from './featureEngineering.js';

describe('featureEngineeringPhaseConfig', () => {
  const baseContext: ToolContext = {
    projectId: 'project-1',
    toolCallId: 'tool-1',
    run: {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      projectId: 'project-1',
      phase: 'feature_engineering',
      status: 'running',
      currentNode: 'propose_feature',
      revision: 1,
      retryBudget: 0,
      repairAttemptCount: 0,
      createdAt: new Date('2026-03-23T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-23T00:00:00.000Z').toISOString()
    },
    args: {},
    turn: {
      projectId: 'project-1',
      phase: 'feature_engineering',
      datasetId: 'dataset-1'
    }
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an explicit error when getOrCreate does not return a run', async () => {
    vi.spyOn(featureRunRepository, 'getOrCreate').mockResolvedValueOnce(undefined as never);

    const result = await featureEngineeringPhaseConfig.executePhaseSpecificTool(
      'propose_feature',
      {
        featureId: 'feat-1',
        featureName: 'log_salary',
        method: 'log_transform'
      },
      baseContext
    );

    expect(result).toEqual({
      error: 'Failed to initialize feature run for project project-1.'
    });
  });

  describe('getStageConfig', () => {
    it('continue_feature_pipeline returns text mode with lifecycle tools', () => {
      const config = featureEngineeringPhaseConfig.getStageConfig('continue_feature_pipeline');

      expect(config.mode).toBe('text');
      expect(config.allowedTools.length).toBeGreaterThan(0);

      const toolNames = config.allowedTools.map((t) => t.name);
      expect(toolNames).toContain('propose_feature');
      expect(toolNames).toContain('execute_feature');
      expect(toolNames).toContain('validate_feature');
      expect(toolNames).toContain('register_feature');
      expect(toolNames).toContain('checkpoint_feature_pipeline');
    });

    it('continue_feature_pipeline does NOT include get_dataset_profile', () => {
      const config = featureEngineeringPhaseConfig.getStageConfig('continue_feature_pipeline');
      const toolNames = config.allowedTools.map((t) => t.name);

      expect(toolNames).not.toContain('get_dataset_profile');
    });

    it('continue_feature_pipeline includes propose_feature, write_cell, render_ui, ask_user', () => {
      const config = featureEngineeringPhaseConfig.getStageConfig('continue_feature_pipeline');
      const toolNames = config.allowedTools.map((t) => t.name);

      expect(toolNames).toContain('propose_feature');
      expect(toolNames).toContain('write_cell');
      expect(toolNames).toContain('render_ui');
      expect(toolNames).toContain('ask_user');
    });
  });

  it('returns an explicit error when getOrCreate throws', async () => {
    vi.spyOn(featureRunRepository, 'getOrCreate').mockRejectedValueOnce(new Error('disk offline'));

    const result = await featureEngineeringPhaseConfig.executePhaseSpecificTool(
      'propose_feature',
      {
        featureId: 'feat-1',
        featureName: 'log_salary',
        method: 'log_transform'
      },
      baseContext
    );

    expect(result).toEqual({
      error: 'Failed to initialize feature run for project project-1: disk offline'
    });
  });

  it('rejects propose_feature through the full dispatch path when turn.prompt has selected feature IDs', async () => {
    // Integration test for the propose_feature implementation-mode guard.
    // Verifies ctx.turn.prompt is threaded through executeFeatureToolCall to
    // the FeatureToolContext so the guard in proposalTools.proposeFeature can
    // see the "Selected feature IDs to implement" marker. A prior regression
    // left this wire-through missing and the guard silently failed to block
    // hallucinated propose_feature calls during implementation turns, which
    // caused the user's LLM to re-propose already-selected features and loop
    // until MAX_ITERATIONS_EXCEEDED.
    vi.spyOn(featureRunRepository, 'getOrCreate').mockResolvedValueOnce({
      runId: 'feat-run-guard-1',
      projectId: 'project-1',
      features: {},
      createdAt: new Date('2026-04-05T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-04-05T00:00:00.000Z').toISOString()
    });
    vi.spyOn(featureRunRepository, 'save').mockResolvedValueOnce(undefined);

    const result = await featureEngineeringPhaseConfig.executePhaseSpecificTool(
      'propose_feature',
      {
        featureId: 'feat-x',
        featureName: 'new_idea',
        method: 'log1p_transform',
        sourceColumns: ['salary']
      },
      {
        ...baseContext,
        turn: {
          ...baseContext.turn,
          prompt: [
            'Implement the enabled features in the notebook.',
            '',
            'Selected feature IDs to implement: feat-a, feat-b',
            'Enabled features to implement: feat_a; feat_b'
          ].join('\n')
        }
      }
    );

    expect(result.error).toMatch(/not allowed in implementation mode/i);
    expect(result.error).toMatch(/materialize_feature_code/);
    // The guard must fire BEFORE the handler persists anything.
    expect(featureRunRepository.save).not.toHaveBeenCalled();
  });

  it('allows propose_feature through the full dispatch path when turn.prompt has NO selected feature IDs', async () => {
    const savedRuns: Array<{ features: Record<string, unknown> }> = [];
    vi.spyOn(featureRunRepository, 'getOrCreate').mockResolvedValueOnce({
      runId: 'feat-run-guard-2',
      projectId: 'project-1',
      features: {},
      createdAt: new Date('2026-04-05T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-04-05T00:00:00.000Z').toISOString()
    });
    vi.spyOn(featureRunRepository, 'save').mockImplementation(async (run) => {
      savedRuns.push(run as { features: Record<string, unknown> });
    });

    const result = await featureEngineeringPhaseConfig.executePhaseSpecificTool(
      'propose_feature',
      {
        featureId: 'feat-y',
        featureName: 'salary_log',
        method: 'log1p_transform',
        sourceColumns: ['salary']
      },
      {
        ...baseContext,
        turn: {
          ...baseContext.turn,
          prompt: 'Propose 3 diverse features for this dataset.'
        }
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.output).toMatchObject({ status: 'proposed', featureId: 'feat-y' });
    expect(savedRuns).toHaveLength(1);
    expect(savedRuns[0].features).toHaveProperty('feat-y');
  });

  it('falls back to a notebook-scoped feature run when explicit runId lookup misses', async () => {
    const getByIdSpy = vi.spyOn(featureRunRepository, 'getById').mockResolvedValueOnce(undefined);
    const getOrCreateSpy = vi.spyOn(featureRunRepository, 'getOrCreate').mockResolvedValueOnce({
      runId: 'feat-run-notebook-1',
      projectId: 'project-1',
      scopeNotebookId: 'nb-1',
      features: {},
      createdAt: new Date('2026-03-23T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-23T00:00:00.000Z').toISOString()
    });

    const result = await featureEngineeringPhaseConfig.executePhaseSpecificTool(
      'unknown_feature_tool',
      {
        runId: 'workflow-run-1',
        notebookId: 'nb-1'
      },
      baseContext
    );

    expect(getByIdSpy).toHaveBeenCalledWith('workflow-run-1');
    expect(getOrCreateSpy).toHaveBeenCalledWith('project-1', undefined, { notebookId: 'nb-1' });
    expect(result).toEqual({ error: 'Unknown feature tool: unknown_feature_tool' });
  });
});
