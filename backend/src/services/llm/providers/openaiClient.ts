import OpenAI from 'openai';
import type { Responses } from 'openai/resources/responses/responses';

import type { LlmClient, LlmRequest, LlmStreamHandlers, LlmToolCall, RawLlmUsage } from '../llmClient.js';
import { normalizeReasoningSelection, resolveCatalogModel } from '../modelCatalog.js';

interface OpenAiClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class OpenAiClient implements LlmClient {
  private client: OpenAI;
  private model: string;

  constructor(options: OpenAiClientOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl.replace(/\/$/, '') || undefined,
      timeout: options.timeoutMs,
      maxRetries: 0
    });
    this.model = resolveCatalogModel(options.model).id;
  }

  async complete(request: LlmRequest): Promise<string> {
    const response = await this.client.responses.create(buildOpenAiCreateBody(request, this.model));
    return response.output_text ?? '';
  }

  async stream(request: LlmRequest, handlers: LlmStreamHandlers): Promise<string> {
    let fullText = '';
    const stream = this.client.responses.stream(buildOpenAiStreamBody(request, this.model));

    stream.on('response.output_text.delta', (event) => {
      if (!event.delta) {
        return;
      }
      fullText += event.delta;
      handlers.onToken(event.delta);
    });

    stream.on('response.reasoning_summary_text.delta', (event) => {
      if (event.delta && handlers.onThinking) {
        handlers.onThinking(event.delta);
      }
    });

    const response = await stream.finalResponse();
    emitToolCalls(response, handlers);

    if (handlers.onUsage && response.usage) {
      handlers.onUsage(response.usage as RawLlmUsage);
    }

    return fullText || response.output_text || '';
  }
}

function buildOpenAiCreateBody(
  request: LlmRequest,
  model: string
): Responses.ResponseCreateParamsNonStreaming {
  return {
    ...buildOpenAiBodyBase(request, model),
    stream: false
  };
}

function buildOpenAiStreamBody(
  request: LlmRequest,
  model: string
): Responses.ResponseCreateParamsStreaming {
  return {
    ...buildOpenAiBodyBase(request, model),
    stream: true
  };
}

function buildOpenAiBodyBase(
  request: LlmRequest,
  model: string
): Omit<Responses.ResponseCreateParamsNonStreaming, 'stream'> {
  const resolvedModel = resolveCatalogModel(model);
  const tools = request.tools?.length
    ? request.tools.map((tool) => ({
        type: 'function' as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: false
      }))
    : undefined;

  const toolChoice = request.toolChoice
    ? request.toolChoice === 'any'
      ? 'required'
      : request.toolChoice
    : undefined;

  const reasoningEffort = normalizeReasoningEffort(request, resolvedModel.id);
  const input: Responses.ResponseInput = [
    ...request.messages.map((msg): Responses.EasyInputMessage => ({
      type: 'message',
      role: msg.role,
      content: msg.content
    })),
    ...buildToolHistoryInput(request)
  ];

  const supportsResolvedReasoning = reasoningEffort
    ? supportsReasoningValue(resolvedModel.id, reasoningEffort)
    : false;

  return {
    model: resolvedModel.id,
    input,
    temperature: shouldSendTemperature(resolvedModel.id, reasoningEffort)
      ? (request.temperature ?? 0.3)
      : undefined,
    max_output_tokens: request.maxOutputTokens ?? 2048,
    store: false,
    tools,
    tool_choice: tools?.length ? toolChoice : undefined,
    reasoning: supportsResolvedReasoning
      ? {
          effort: reasoningEffort,
          summary: reasoningEffort === 'none' ? undefined : 'concise'
        }
      : undefined,
    text: request.responseMimeType === 'application/json'
      ? { format: { type: 'json_object' } }
      : undefined
  };
}

function shouldSendTemperature(modelId: string, reasoningEffort: string | undefined): boolean {
  if (!modelId.startsWith('gpt-5')) {
    return true;
  }

  // Current GPT-5 Responses API guidance rejects temperature for GPT-5 mini/nano,
  // and for GPT-5.4/5.2 unless reasoning is disabled. We omit temperature entirely
  // for GPT-5 requests to keep request construction valid across the supported GPT-5 set.
  if (reasoningEffort && reasoningEffort !== 'none') {
    return false;
  }

  return false;
}

function buildToolHistoryInput(request: LlmRequest): Responses.ResponseInputItem[] {
  const items: Responses.ResponseInputItem[] = [];
  const historyLength = Math.max(request.toolCallHistory?.length ?? 0, request.toolResultHistory?.length ?? 0);

  for (let index = 0; index < historyLength; index += 1) {
    const toolCall = request.toolCallHistory?.[index];
    if (toolCall) {
      const callId = `history-call-${index + 1}`;
      items.push({
        type: 'function_call',
        call_id: callId,
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.args ?? {})
      });

      const toolResult = request.toolResultHistory?.[index];
      if (toolResult) {
        items.push({
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(toolResult.response)
        });
      }
    }
  }

  return items;
}

function normalizeReasoningEffort(request: LlmRequest, modelId: string) {
  return normalizeReasoningSelection({
    modelId,
    reasoningEffort: request.reasoningEffort,
    enableThinking: request.enableThinking,
    thinkingLevel: request.thinkingLevel
  });
}

function supportsReasoningValue(modelId: string, value: string): boolean {
  const model = resolveCatalogModel(modelId);
  return model.reasoningEfforts.includes(value as (typeof model.reasoningEfforts)[number]);
}

function emitToolCalls(response: Responses.Response, handlers: LlmStreamHandlers) {
  if (!handlers.onToolCall) {
    return;
  }

  for (const item of response.output ?? []) {
    if (item.type !== 'function_call') {
      continue;
    }

    const toolCall: LlmToolCall = {
      name: item.name,
      args: parseToolArguments(item.arguments)
    };
    handlers.onToolCall(toolCall);
  }
}

function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to empty object.
  }
  return {};
}
