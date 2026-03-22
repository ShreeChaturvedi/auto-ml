import { describe, expect, it } from 'vitest';

import { WorkflowToolExecutedEventSchema } from '@/types/workflow';

describe('WorkflowToolExecutedEventSchema', () => {
  it('accepts feature-engineering tool events', () => {
    const parsed = WorkflowToolExecutedEventSchema.safeParse({
      type: 'tool_executed',
      call: {
        id: 'wf-call-1',
        tool: 'propose_feature',
        args: {
          featureName: 'tenure_bucket',
          method: 'binning'
        }
      },
      result: {
        id: 'wf-call-1',
        tool: 'propose_feature',
        output: {
          status: 'ok',
          featureId: 'feat-1'
        }
      }
    });

    expect(parsed.success).toBe(true);
  });
});
