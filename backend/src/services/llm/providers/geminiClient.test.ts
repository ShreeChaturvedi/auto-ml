import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LlmRequest, LlmToolCall } from '../llmClient.js';

import { GeminiClient } from './geminiClient.js';

function createSseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n'));
      controller.close();
    }
  });
}

function createRequest(): LlmRequest {
  return {
    messages: [{ role: 'user', content: 'run tools' }],
    tools: [
      {
        name: 'run_cell',
        description: 'Run a notebook cell',
        parameters: {
          type: 'object',
          properties: {
            cellId: { type: 'string' }
          }
        }
      }
    ],
    toolChoice: 'auto'
  };
}

describe('GeminiClient tool call parsing', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('keeps distinct same-name tool calls separate', async () => {
    const payload = {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: 'run_cell', args: { cellId: 'cell-1' } } },
              { functionCall: { name: 'run_cell', args: { cellId: 'cell-2' } } }
            ]
          }
        }
      ]
    };

    globalThis.fetch = vi.fn(async () => new Response(createSseStream([payload]), { status: 200 })) as typeof fetch;

    const client = new GeminiClient({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1000
    });

    const seen: LlmToolCall[] = [];
    await client.stream(createRequest(), {
      onToken: () => undefined,
      onToolCall: (call) => seen.push(call)
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ name: 'run_cell', args: { cellId: 'cell-1' } });
    expect(seen[1]).toMatchObject({ name: 'run_cell', args: { cellId: 'cell-2' } });
  });

  it('merges fragmented same-name tool call chunks', async () => {
    const chunk1 = {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: 'run_cell', args: '{"cellId":"cell-1"' } }
            ]
          }
        }
      ]
    };

    const chunk2 = {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: 'run_cell', args: '{"cellId":"cell-1","mode":"safe"}' } }
            ]
          }
        }
      ]
    };

    globalThis.fetch = vi.fn(async () => new Response(createSseStream([chunk1, chunk2]), { status: 200 })) as typeof fetch;

    const client = new GeminiClient({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1000
    });

    const seen: LlmToolCall[] = [];
    await client.stream(createRequest(), {
      onToken: () => undefined,
      onToolCall: (call) => seen.push(call)
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      name: 'run_cell',
      args: { cellId: 'cell-1', mode: 'safe' }
    });
  });

  it('retries once with backoff on 503 stream failure', async () => {
    const payload = {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: 'run_cell', args: { cellId: 'cell-retry-503' } } }
            ]
          }
        }
      ]
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporary overload', { status: 503 }))
      .mockResolvedValueOnce(new Response(createSseStream([payload]), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new GeminiClient({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1000
    });

    const seen: LlmToolCall[] = [];
    await client.stream(createRequest(), {
      onToken: () => undefined,
      onToolCall: (call) => seen.push(call)
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      name: 'run_cell',
      args: { cellId: 'cell-retry-503' }
    });
  });

  it('retries once with backoff on timeout-abort stream failure', async () => {
    const payload = {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: 'run_cell', args: { cellId: 'cell-retry-timeout' } } }
            ]
          }
        }
      ]
    };

    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(new Response(createSseStream([payload]), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new GeminiClient({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1000
    });

    const seen: LlmToolCall[] = [];
    await client.stream(createRequest(), {
      onToken: () => undefined,
      onToolCall: (call) => seen.push(call)
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      name: 'run_cell',
      args: { cellId: 'cell-retry-timeout' }
    });
  });

});
