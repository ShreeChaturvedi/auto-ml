import { describe, expect, it } from 'vitest';

import { inferPreprocessingActionNode } from './preprocessing/transition.js';
import { preprocessingPhaseConfig } from './preprocessing.js';

describe('preprocessingPhaseConfig', () => {
  it('routes failed execution results back to write_code for recovery', () => {
    expect(preprocessingPhaseConfig.resolveNextStage('record_execution', [
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
    ])).toBe('write_code');
  });

  it('stays in validate when validation reports failure without approval pause', () => {
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
    ])).toBe('validate');
  });
});
