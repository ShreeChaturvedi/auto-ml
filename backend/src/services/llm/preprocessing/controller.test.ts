import { describe, expect, it, vi } from 'vitest';

import type { DatasetProfile } from '../../../types/dataset.js';
import type { ToolResult } from '../../../types/llm.js';
import type { LlmClient } from '../llmClient.js';

import { resolvePreprocessingControllerTurn } from './controller.js';

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

function createClient(classification: { turnMode: 'answer_only' | 'action_required'; rationale: string }): LlmClient {
  return {
    complete: vi.fn(async () => JSON.stringify(classification)),
    stream: vi.fn(async () => '')
  };
}

describe('resolvePreprocessingControllerTurn', () => {
  it('routes explanatory turns to answer mode without tools', async () => {
    const client = createClient({
      turnMode: 'answer_only',
      rationale: 'The user asked a conceptual question.'
    });

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Why would scaling help here?',
      threadId: 'prep-thread:test:answer'
    });

    expect(decision.summary.turnMode).toBe('answer_only');
    expect(decision.summary.currentNode).toBe('answer');
    expect(decision.summary.requireToolCall).toBe(false);
    expect(decision.request.tools).toBeUndefined();
  });

  it('routes proposed steps to the generate_code state', async () => {
    const client = createClient({
      turnMode: 'action_required',
      rationale: 'The user asked to modify preprocessing.'
    });
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'propose_transformation_step',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'pending'
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Continue',
      toolResults,
      continuation: true,
      threadId: 'prep-thread:test:generate'
    });

    expect(decision.summary.turnMode).toBe('action_required');
    expect(decision.summary.currentNode).toBe('generate_code');
    expect(decision.summary.allowedTools).toContain('materialize_step_code');
    expect(decision.request.toolChoice).toBe('any');
  });

  it('routes executed steps to validation with validate-only tools', async () => {
    const client = createClient({
      turnMode: 'action_required',
      rationale: 'unused'
    });
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'execute_transformation_step',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'running'
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Continue',
      continuation: true,
      toolResults,
      threadId: 'prep-thread:test:validate'
    });

    expect(decision.summary.currentNode).toBe('validate');
    expect(decision.summary.allowedTools).toEqual([
      'validate_step_result',
      'profile_active_dataset',
      'read_cell'
    ]);
    expect(decision.request.toolChoice).toBe('any');
  });

  it('routes failed execution results back to write_code for recovery', async () => {
    const client = createClient({
      turnMode: 'action_required',
      rationale: 'unused'
    });
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'execute_transformation_step',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'failed',
          step: {
            stepId: 'step-1',
            status: 'failed',
            lastExecuteSucceeded: false
          }
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Continue',
      continuation: true,
      toolResults,
      threadId: 'prep-thread:test:execution-failed'
    });

    expect(decision.summary.currentNode).toBe('write_code');
    expect(decision.summary.allowedTools).toContain('run_cell');
    expect(decision.summary.requireToolCall).toBe(true);
  });

  it('blocks on pending approval without classifying again', async () => {
    const client = createClient({
      turnMode: 'answer_only',
      rationale: 'unused'
    });
    const completeSpy = vi.spyOn(client, 'complete');
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'validate_step_result',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'awaiting_approval'
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Continue',
      toolResults,
      threadId: 'prep-thread:test:approval'
    });

    expect(completeSpy).not.toHaveBeenCalled();
    expect(decision.summary.currentNode).toBe('await_approval');
    expect(decision.summary.allowTextResponse).toBe(true);
    expect(decision.summary.requireToolCall).toBe(false);
  });

  it('routes explicit approval instructions to the commit state while pending approval', async () => {
    const client = createClient({
      turnMode: 'answer_only',
      rationale: 'unused'
    });
    const completeSpy = vi.spyOn(client, 'complete');
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'validate_step_result',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'awaiting_approval'
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Approve it and continue.',
      toolResults,
      threadId: 'prep-thread:test:approval-commit'
    });

    expect(completeSpy).not.toHaveBeenCalled();
    expect(decision.summary.currentNode).toBe('commit');
    expect(decision.summary.allowedTools).toContain('commit_transformation_step');
    expect(decision.summary.allowTextResponse).toBe(false);
    expect(decision.summary.requireToolCall).toBe(true);
  });

  it('still allows answer-only routing for a new user question after prior tool history', async () => {
    const client = createClient({
      turnMode: 'answer_only',
      rationale: 'The user asked a new explanatory question.'
    });
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'commit_transformation_step',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'applied'
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Why did we validate row counts here?',
      continuation: false,
      toolResults,
      threadId: 'prep-thread:test:followup-question'
    });

    expect(decision.summary.turnMode).toBe('answer_only');
    expect(decision.summary.currentNode).toBe('answer');
    expect(decision.summary.requireToolCall).toBe(false);
  });

  it('treats explicit continuations as action-required even without tool history', async () => {
    const client = createClient({
      turnMode: 'answer_only',
      rationale: 'unused'
    });
    const completeSpy = vi.spyOn(client, 'complete');

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Continue preprocessing.',
      continuation: true,
      threadId: 'prep-thread:test:continuation-without-history'
    });

    expect(completeSpy).not.toHaveBeenCalled();
    expect(decision.summary.turnMode).toBe('action_required');
    expect(decision.summary.currentNode).toBe('plan_step');
    expect(decision.summary.requireToolCall).toBe(true);
  });

  it('falls back to action-required when classification output is invalid', async () => {
    const client: LlmClient = {
      complete: vi.fn(async () => 'not-json'),
      stream: vi.fn(async () => '')
    };

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Scale the numeric columns.',
      threadId: 'prep-thread:test:invalid-classification'
    });

    expect(decision.summary.turnMode).toBe('action_required');
    expect(decision.summary.currentNode).toBe('plan_step');
    expect(decision.summary.classificationRationale).toContain('fallback');
    expect(decision.request.toolChoice).toBe('any');
  });

  it('routes committed steps to summarize mode without mutation tools', async () => {
    const client = createClient({
      turnMode: 'action_required',
      rationale: 'unused'
    });
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'commit_transformation_step',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'applied'
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Continue',
      continuation: true,
      toolResults,
      threadId: 'prep-thread:test:summarize'
    });

    expect(decision.summary.currentNode).toBe('summarize');
    expect(decision.summary.allowTextResponse).toBe(true);
    expect(decision.summary.requireToolCall).toBe(false);
    expect(decision.request.tools).toBeUndefined();
  });

  it('starts a fresh action turn after a completed step when continuation is false', async () => {
    const client = createClient({
      turnMode: 'action_required',
      rationale: 'The user asked for the next preprocessing action.'
    });
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'commit_transformation_step',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'applied'
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Propose the next safest missing-value fix.',
      continuation: false,
      toolResults,
      threadId: 'prep-thread:test:fresh-action-after-complete'
    });

    expect(decision.summary.turnMode).toBe('action_required');
    expect(decision.summary.currentNode).toBe('plan_step');
    expect(decision.summary.requireToolCall).toBe(true);
  });
});
