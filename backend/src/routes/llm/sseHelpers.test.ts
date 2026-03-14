import { describe, expect, it } from 'vitest';

import type { LlmClient, LlmRequest, LlmStreamHandlers } from '../../services/llm/llmClient.js';

import { streamLlmResponse } from './sseHelpers.js';

class MockResponse {
  public destroyed = false;
  public writableEnded = false;
  public headers = new Map<string, string>();
  public chunks: string[] = [];
  private closeHandlers: Array<() => void> = [];

  setHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }

  end() {
    this.writableEnded = true;
  }

  on(event: string, handler: () => void) {
    if (event === 'close') {
      this.closeHandlers.push(handler);
    }
  }

  close() {
    for (const handler of this.closeHandlers) {
      handler();
    }
  }
}

function parseEvents(res: MockResponse) {
  return res.chunks
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function createClient(streamImpl: (request: LlmRequest, handlers: LlmStreamHandlers) => Promise<string>): LlmClient {
  return {
    complete: async () => '',
    stream: streamImpl
  };
}

describe('streamLlmResponse preprocessing behavior', () => {
  it('allows answer-only preprocessing text turns when enabled', async () => {
    const res = new MockResponse();
    const client = createClient(async (_request, handlers) => {
      handlers.onToken('Scaling helps stabilize feature ranges.');
      return 'Scaling helps stabilize feature ranges.';
    });

    await streamLlmResponse(
      res as never,
      client,
      { messages: [{ role: 'user', content: 'Why scale?' }] },
      'preprocessing',
      undefined,
      {
        allowTextOnlyResponse: true,
        controllerSummary: {
          threadId: 'prep-thread:test',
          turnMode: 'answer_only',
          currentNode: 'answer'
        }
      }
    );

    const events = parseEvents(res);
    const envelope = events.find((event) => event.type === 'envelope') as { envelope?: { message?: string } } | undefined;
    const error = events.find((event) => event.type === 'error');

    expect(error).toBeUndefined();
    expect(envelope?.envelope?.message).toContain('Scaling helps stabilize');
  });

  it('emits both message and tool calls for preprocessing action turns', async () => {
    const res = new MockResponse();
    const client = createClient(async (_request, handlers) => {
      handlers.onToken('I will add a scaling step.');
      handlers.onToolCall?.({
        name: 'propose_transformation_step',
        args: {
          title: 'Scale numeric features',
          intentType: 'scale_features'
        }
      });
      return '';
    });

    await streamLlmResponse(
      res as never,
      client,
      { messages: [{ role: 'user', content: 'Scale the numeric columns.' }] },
      'preprocessing',
      undefined,
      {
        allowTextOnlyResponse: false,
        controllerSummary: {
          threadId: 'prep-thread:test',
          turnMode: 'action_required',
          currentNode: 'plan_step'
        }
      }
    );

    const events = parseEvents(res);
    const envelope = events.find((event) => event.type === 'envelope') as {
      envelope?: { message?: string; tool_calls?: Array<Record<string, unknown>> };
    } | undefined;

    expect(envelope?.envelope?.message).toContain('I will add a scaling step.');
    expect(envelope?.envelope?.tool_calls?.[0]?.tool).toBe('propose_transformation_step');
  });

  it('still errors on text-only preprocessing action turns', async () => {
    const res = new MockResponse();
    const client = createClient(async (_request, handlers) => {
      handlers.onToken('I would normalize the values.');
      return 'I would normalize the values.';
    });

    await streamLlmResponse(
      res as never,
      client,
      { messages: [{ role: 'user', content: 'Normalize the values.' }] },
      'preprocessing'
    );

    const events = parseEvents(res);
    const error = events.find((event) => event.type === 'error') as { message?: string } | undefined;
    expect(error?.message).toContain('text without tool calls');
  });

  it('resets text preview before retrying a preprocessing action turn', async () => {
    const res = new MockResponse();
    let attempt = 0;
    const client = createClient(async (_request, handlers) => {
      attempt += 1;
      if (attempt === 1) {
        handlers.onToken('First attempt talked instead of acting.');
        return 'First attempt talked instead of acting.';
      }

      handlers.onToken('I will create the step now.');
      handlers.onToolCall?.({
        name: 'propose_transformation_step',
        args: {
          title: 'Scale numeric features',
          intentType: 'scale_numeric'
        }
      });
      return '';
    });

    await streamLlmResponse(
      res as never,
      client,
      { messages: [{ role: 'user', content: 'Scale the numeric columns.' }] },
      'preprocessing'
    );

    const events = parseEvents(res);
    const envelope = events.find((event) => event.type === 'envelope') as {
      envelope?: { message?: string; tool_calls?: Array<Record<string, unknown>> };
    } | undefined;

    expect(attempt).toBe(2);
    expect(envelope?.envelope?.message).toBe('I will create the step now.');
    expect(envelope?.envelope?.message).not.toContain('First attempt');
    expect(envelope?.envelope?.tool_calls?.[0]?.tool).toBe('propose_transformation_step');
  });

  it('retries reasoning-only preprocessing turns and accepts tool calls from the retry', async () => {
    const res = new MockResponse();
    let attempt = 0;
    const client = createClient(async (_request, handlers) => {
      attempt += 1;
      if (attempt === 1) {
        handlers.onThinking?.('I should inspect the dataset first.');
        return '';
      }

      handlers.onToolCall?.({
        name: 'profile_active_dataset',
        args: {
          datasetId: 'ds-1'
        }
      });
      return '';
    });

    await streamLlmResponse(
      res as never,
      client,
      { messages: [{ role: 'user', content: 'Profile missing values.' }] },
      'preprocessing'
    );

    const events = parseEvents(res);
    const envelope = events.find((event) => event.type === 'envelope') as {
      envelope?: { tool_calls?: Array<Record<string, unknown>> };
    } | undefined;
    const error = events.find((event) => event.type === 'error');

    expect(attempt).toBe(2);
    expect(error).toBeUndefined();
    expect(envelope?.envelope?.tool_calls?.[0]?.tool).toBe('profile_active_dataset');
  });

  it('errors when preprocessing returns an empty action-required response', async () => {
    const res = new MockResponse();
    const client = createClient(async () => '');

    await streamLlmResponse(
      res as never,
      client,
      { messages: [{ role: 'user', content: 'Scale the numeric columns.' }] },
      'preprocessing'
    );

    const events = parseEvents(res);
    const error = events.find((event) => event.type === 'error') as { message?: string } | undefined;
    const envelope = events.find((event) => event.type === 'envelope');

    expect(error?.message).toContain('no actionable preprocessing output');
    expect(envelope).toBeUndefined();
  });

  it('preserves the toolless-text diagnosis when the retry comes back empty', async () => {
    const res = new MockResponse();
    let attempt = 0;
    const client = createClient(async (_request, handlers) => {
      attempt += 1;
      if (attempt === 1) {
        handlers.onToken('I would normalize the values.');
        return 'I would normalize the values.';
      }

      return '';
    });

    await streamLlmResponse(
      res as never,
      client,
      { messages: [{ role: 'user', content: 'Normalize the values.' }] },
      'preprocessing'
    );

    const events = parseEvents(res);
    const error = events.find((event) => event.type === 'error') as { message?: string } | undefined;

    expect(attempt).toBe(2);
    expect(error?.message).toContain('text without tool calls');
  });
});
