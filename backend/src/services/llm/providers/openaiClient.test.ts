import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { LlmRequest } from '../llmClient.js';

const {
  openAiCreateMock,
  openAiStreamMock
} = vi.hoisted(() => ({
  openAiCreateMock: vi.fn(),
  openAiStreamMock: vi.fn()
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function MockOpenAI() {
    return {
      responses: {
        create: openAiCreateMock,
        stream: openAiStreamMock
      }
    };
  })
}));

import { OpenAiClient } from './openaiClient.js';

type StreamHandler = (payload: Record<string, unknown>) => void;

class MockResponsesStream {
  private handlers = new Map<string, StreamHandler[]>();
  private finalizer: () => Promise<Record<string, unknown>>;

  constructor(finalizer: () => Promise<Record<string, unknown>>) {
    this.finalizer = finalizer;
  }

  on(event: string, handler: StreamHandler) {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
    return this;
  }

  emit(event: string, payload: Record<string, unknown>) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }

  async finalResponse() {
    return this.finalizer();
  }
}

function createClient() {
  return new OpenAiClient({
    apiKey: 'test-key',
    baseUrl: 'https://example.invalid/v1',
    model: 'gpt-5.4',
    timeoutMs: 10_000
  });
}

function buildRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    messages: [{ role: 'user', content: 'Scale the numeric columns.' }],
    ...overrides
  };
}

describe('OpenAiClient streaming tool handling', () => {
  beforeEach(() => {
    openAiCreateMock.mockReset();
    openAiStreamMock.mockReset();
  });

  it('emits streamed tool calls once and skips the duplicate final response item', async () => {
    const stream = new MockResponsesStream(async () => {
      stream.emit('response.output_text.delta', { delta: 'Planning step.' });
      stream.emit('response.function_call_arguments.done', {
        item_id: 'fc_1',
        name: 'propose_transformation_step',
        arguments: '{"title":"Scale numeric columns"}'
      });

      return {
        output_text: 'Planning step.',
        output: [
          {
            type: 'function_call',
            id: 'fc_1',
            name: 'propose_transformation_step',
            arguments: '{"title":"Scale numeric columns"}'
          }
        ],
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          total_tokens: 18
        }
      };
    });
    openAiStreamMock.mockReturnValue(stream);

    const client = createClient();
    const onToken = vi.fn();
    const onToolCall = vi.fn();
    const onUsage = vi.fn();

    const result = await client.stream(buildRequest(), {
      onToken,
      onToolCall,
      onUsage
    });

    expect(result).toBe('Planning step.');
    expect(onToken).toHaveBeenCalledWith('Planning step.');
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall).toHaveBeenCalledWith({
      name: 'propose_transformation_step',
      args: {
        title: 'Scale numeric columns'
      }
    });
    expect(onUsage).toHaveBeenCalledWith({
      input_tokens: 11,
      output_tokens: 7,
      total_tokens: 18
    });
  });

  it('maps toolChoice any to required and tolerates invalid tool arguments', async () => {
    const stream = new MockResponsesStream(async () => ({
      output_text: '',
      output: [
        {
          type: 'function_call',
          id: 'fc_2',
          name: 'materialize_step_code',
          arguments: 'not-json'
        }
      ]
    }));
    openAiStreamMock.mockReturnValue(stream);

    const client = createClient();
    const onToolCall = vi.fn();

    await client.stream(buildRequest({
      tools: [
        {
          name: 'materialize_step_code',
          description: 'Generate code for the current step.',
          parameters: {
            type: 'object'
          }
        }
      ],
      toolChoice: 'any'
    }), {
      onToken: vi.fn(),
      onToolCall
    });

    expect(openAiStreamMock).toHaveBeenCalledWith(expect.objectContaining({
      tool_choice: 'required'
    }));
    expect(onToolCall).toHaveBeenCalledWith({
      name: 'materialize_step_code',
      args: {}
    });
  });
});
