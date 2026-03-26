import { describe, expect, it } from 'vitest';

import { parsePlannerResponse } from './plannerAction.js';

describe('parsePlannerResponse', () => {
  it('parses fenced JSON planner output', () => {
    const plan = parsePlannerResponse(`
      \`\`\`json
      {"kind":"assistant_message","message":"Keep the first feature simple."}
      \`\`\`
    `);

    expect(plan).toEqual({
      kind: 'assistant_message',
      message: 'Keep the first feature simple.'
    });
  });

  it('parses planner output wrapped in prose', () => {
    const plan = parsePlannerResponse(`
      Here is the plan:
      {"kind":"tool_call","toolName":"propose_feature","toolArgs":{"featureName":"tenure_bucket"}}
      Please apply it.
    `);

    expect(plan).toEqual({
      kind: 'tool_call',
      toolName: 'propose_feature',
      toolArgs: {
        featureName: 'tenure_bucket'
      }
    });
  });
});
