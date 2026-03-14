import { describe, expect, it } from 'vitest';

import { loadWorkflowHistory, persistWorkflowHistory } from './history.js';

describe('workflow history normalization', () => {
  it('dedupes repeated tool calls and results by stable identity', () => {
    const metadata = {
      history: {
        toolCalls: [
          { id: 'call-1', tool: 'propose_transformation_step', args: { title: 'A' } },
          { id: 'call-1', tool: 'propose_transformation_step', args: { title: 'A' } }
        ],
        toolResults: [
          { id: 'call-1', tool: 'propose_transformation_step', output: { status: 'pending' } },
          { id: 'call-1', tool: 'propose_transformation_step', output: { status: 'pending' } }
        ]
      }
    };

    const loaded = loadWorkflowHistory(metadata);

    expect(loaded.toolCalls).toHaveLength(1);
    expect(loaded.toolResults).toHaveLength(1);

    const persisted = persistWorkflowHistory({}, loaded);
    const history = persisted.history as { toolCalls: unknown[]; toolResults: unknown[] };

    expect(history.toolCalls).toHaveLength(1);
    expect(history.toolResults).toHaveLength(1);
  });
});
