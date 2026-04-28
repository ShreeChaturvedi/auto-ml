import { describe, expect, it, vi } from 'vitest';

import { MockPreprocessingClient } from './mockPreprocessingClient.js';

describe('MockPreprocessingClient', () => {
  const client = new MockPreprocessingClient();

  it('returns action-required JSON for preprocessing classifier requests', async () => {
    const raw = await client.complete({
      messages: [
        {
          role: 'system',
          content: 'You are a strict preprocessing turn classifier.'
        },
        {
          role: 'user',
          content: 'User prompt: Create a safe preprocessing checkpoint.'
        }
      ],
      responseMimeType: 'application/json'
    });

    expect(JSON.parse(raw)).toMatchObject({
      turnMode: 'action_required'
    });
  });

  it('returns a deterministic planner tool call for preprocessing planning requests', async () => {
    const raw = await client.complete({
      messages: [
        {
          role: 'system',
          content: 'You are a strict workflow planner for an agentic ML application.\nWorkflow phase: preprocessing'
        },
        {
          role: 'user',
          content: 'Allowed tools:\n- propose_transformation_step'
        }
      ],
      responseMimeType: 'application/json'
    });

    expect(JSON.parse(raw)).toMatchObject({
      kind: 'tool_call',
      toolName: 'propose_transformation_step'
    });
  });

  it('returns deterministic multi-cell preprocessing code for code generation requests', async () => {
    const raw = await client.complete({
      messages: [
        {
          role: 'system',
          content: 'You are a Python data preprocessing expert. Author executable Python code for the requested transformation.'
        },
        {
          role: 'user',
          content: 'Generate code'
        }
      ]
    });

    expect(raw).toContain('# Cell 1');
    expect(raw).toContain('# Cell 2');
    expect(raw).toContain('mock preprocessing checkpoint');
  });

  it('streams summarize text for preprocessing text stages', async () => {
    const onToken = vi.fn();

    const text = await client.stream({
      messages: [
        {
          role: 'system',
          content: 'You are the preprocessing execution controller for an AutoML notebook workflow.'
        },
        {
          role: 'user',
          content: 'Current controller node: summarize'
        }
      ]
    }, {
      onToken
    });

    expect(onToken).toHaveBeenCalledWith(expect.stringContaining('Preprocessing checkpoint'));
    expect(text).toContain('Preprocessing checkpoint');
  });
});
