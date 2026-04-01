import { describe, expect, it } from 'vitest';

import { inferPreprocessingActionNode } from './preprocessing/transition.js';

describe('preprocessingPhaseConfig', () => {
  it('routes failed execution status to validate to preserve existing behavior', () => {
    expect(inferPreprocessingActionNode([
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
    ])).toBe('validate');
  });

  it('routes failed validation status to commit when no approval pause is requested', () => {
    expect(inferPreprocessingActionNode([
      {
        id: 'result-2',
        tool: 'validate_step_result',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'failed',
          step: {
            stepId: 'step-1',
            status: 'failed',
            requiresApproval: false
          }
        }
      }
    ])).toBe('commit');
  });

  it('treats only the latest tool result as pending approval', () => {
    expect(inferPreprocessingActionNode([
      {
        id: 'result-3',
        tool: 'validate_step_result',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'awaiting_approval'
        }
      },
      {
        id: 'result-4',
        tool: 'commit_transformation_step',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'applied'
        }
      }
    ])).toBe('summarize');
  });
});
