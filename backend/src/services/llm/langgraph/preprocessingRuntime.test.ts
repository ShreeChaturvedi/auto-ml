import { describe, expect, it } from 'vitest';

import { buildPreprocessingLangGraph, createPreprocessingLangGraphRuntime } from './preprocessingRuntime.js';

describe('preprocessingLangGraph scaffold', () => {
  it('compiles and bootstraps a run state', async () => {
    const graph = buildPreprocessingLangGraph();
    expect(graph).toBeTruthy();

    const runtime = createPreprocessingLangGraphRuntime();
    const state = await runtime.bootstrapRun({
      runId: 'prep-run-1',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1'
    });

    expect(state).toMatchObject({
      runId: 'prep-run-1',
      projectId: 'project-1',
      currentStage: 'plan_step'
    });
    expect(state.nodeVisits).toEqual(expect.arrayContaining(['Supervisor', 'PlanStep']));
  });

  it('routes execute_code to validate_outcome only when execution succeeded', async () => {
    const runtime = createPreprocessingLangGraphRuntime();
    const initial = await runtime.bootstrapRun({
      runId: 'prep-run-2',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1'
    });

    const succeeded = await runtime.advanceRun(initial, {
      currentStage: 'execute_code',
      nextStage: 'execute_code',
      executeSucceeded: true
    });

    expect(succeeded.currentStage).toBe('validate_outcome');
    expect(succeeded.nodeVisits).toEqual(expect.arrayContaining(['ValidateOutcome']));
  });

  it('routes execute_code failure to generate_code with bounded repair attempts', async () => {
    const runtime = createPreprocessingLangGraphRuntime();
    const initial = await runtime.bootstrapRun({
      runId: 'prep-run-3',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1'
    });

    const failed = await runtime.advanceRun(initial, {
      currentStage: 'execute_code',
      nextStage: 'execute_code',
      executeSucceeded: false,
      autoRepairAllowed: true,
      autoRepairAttempts: 0,
      maxAutoRepairAttempts: 2
    });

    expect(failed.currentStage).toBe('generate_code');
    expect(failed.autoRepairAttempts).toBe(1);
  });

  it('routes validate_outcome to await_approval and resumes on approval', async () => {
    const runtime = createPreprocessingLangGraphRuntime();
    const initial = await runtime.bootstrapRun({
      runId: 'prep-run-4',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1'
    });

    const awaitingApproval = await runtime.advanceRun(initial, {
      currentStage: 'validate_outcome',
      nextStage: 'validate_outcome',
      validationPassed: true,
      requiresApproval: true,
      approvalDecision: 'pending'
    });

    expect(awaitingApproval.currentStage).toBe('await_approval');

    const approved = await runtime.advanceRun(awaitingApproval, {
      currentStage: 'await_approval',
      nextStage: 'await_approval',
      approvalDecision: 'approved'
    });

    expect(approved.currentStage).toBe('commit_or_revise');
    expect(approved.nodeVisits).toEqual(expect.arrayContaining(['AwaitApproval', 'CommitOrRevise']));
  });

  it('does not loop to generate_code when repair attempts reached max', async () => {
    const runtime = createPreprocessingLangGraphRuntime();
    const initial = await runtime.bootstrapRun({
      runId: 'prep-run-5',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1'
    });

    const maxed = await runtime.advanceRun(initial, {
      currentStage: 'validate_outcome',
      nextStage: 'validate_outcome',
      validationPassed: false,
      autoRepairAllowed: true,
      autoRepairAttempts: 2,
      maxAutoRepairAttempts: 2
    });

    expect(maxed.currentStage).toBe('commit_or_revise');
    expect(maxed.autoRepairAttempts).toBe(2);
  });
});
