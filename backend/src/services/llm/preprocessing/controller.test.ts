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

  it('ignores thread-shaped run references from prior tool results', async () => {
    const client = createClient({
      turnMode: 'action_required',
      rationale: 'The user asked to modify preprocessing.'
    });
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'propose_transformation_step',
        output: {
          runId: 'thread-9d8f6554-3c4d-4e2e-a385-9f1951dab555',
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
      threadId: 'prep-thread:test:ignore-thread-run'
    });

    expect(decision.summary.runId).toBeUndefined();
    expect(decision.summary.currentNode).toBe('generate_code');
    expect(decision.request.messages[1]?.content).toContain('Run ID: (none)');
  });

  it('does not adopt failed RUN_NOT_FOUND run references from prior tool results', async () => {
    const client = createClient({
      turnMode: 'action_required',
      rationale: 'The user asked to modify preprocessing.'
    });
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'profile_active_dataset',
        error: 'Run run-short-preprocess not found.',
        output: {
          runId: 'run-short-preprocess',
          isError: true,
          reasonCode: 'RUN_NOT_FOUND'
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Continue',
      toolResults,
      continuation: true,
      threadId: 'prep-thread:test:ignore-missing-run'
    });

    expect(decision.summary.runId).toBeUndefined();
    expect(decision.summary.currentNode).toBe('plan_step');
    expect(decision.request.messages[1]?.content).toContain('Run ID: (none)');
  });

  it('routes successful executed steps to validation with validate-only tools', async () => {
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
          status: 'success'
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

  it('keeps multi-cell steps in write_code after the first run_cell succeeds', async () => {
    const client = createClient({
      turnMode: 'action_required',
      rationale: 'unused'
    });
    const toolResults: ToolResult[] = [
      {
        id: 'result-1',
        tool: 'materialize_step_code',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          step: {
            stepId: 'step-1',
            code: [
              '# Cell 1',
              'missing_before = df.isna().sum()',
              'print(missing_before)',
              '',
              '# Cell 2',
              'df = df.fillna(0)'
            ].join('\n')
          }
        }
      },
      {
        id: 'result-2',
        tool: 'write_cell',
        output: {
          cellId: 'cell-1'
        }
      },
      {
        id: 'result-3',
        tool: 'run_cell',
        output: {
          cellId: 'cell-1',
          status: 'success'
        }
      }
    ];

    const decision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: 'Continue',
      continuation: true,
      toolResults,
      threadId: 'prep-thread:test:multicell-write'
    });

    expect(decision.summary.currentNode).toBe('write_code');
    expect(decision.summary.allowedTools).toContain('write_cell');
    expect(decision.summary.allowedTools).toContain('run_cell');
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

  it('treats plain yes as an approval decision while pending approval', async () => {
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
      prompt: 'yes',
      toolResults,
      threadId: 'prep-thread:test:approval-yes'
    });

    expect(completeSpy).not.toHaveBeenCalled();
    expect(decision.summary.currentNode).toBe('commit');
    expect(decision.summary.allowedTools).toContain('commit_transformation_step');
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
