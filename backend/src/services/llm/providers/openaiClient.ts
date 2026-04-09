import OpenAI from 'openai';
import type { Responses } from 'openai/resources/responses/responses';

import { appLogger } from '../../../logging/logger.js';
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

  private logIfIncomplete(response: Responses.Response): void {
    if (response.status === 'incomplete') {
      appLogger.warn('[OpenAiClient] Response marked incomplete by provider', {
        reason: response.incomplete_details?.reason ?? 'unknown',
        model: this.model
      });
    }
  }

  constructor(options: OpenAiClientOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl.replace(/\/$/, '') || undefined,
      timeout: options.timeoutMs,
      // 1 retry: absorbs transient 429/burst rate limits without excessive
      // cost amplification (modelTurnCollector may already retry on empty
      // output, so we keep this conservative).
      maxRetries: 1
    });
    this.model = resolveCatalogModel(options.model).id;
  }

  async complete(request: LlmRequest): Promise<string> {
    appLogger.debug('[OpenAiClient.complete] Dispatching to OpenAI', {
      model: this.model,
      messages: request.messages.length,
      tools: request.tools?.length ?? 0,
      reasoningEffort: request.reasoningEffort ?? null
    });
    const response = await this.client.responses.create(buildOpenAiCreateBody(request, this.model));
    this.logIfIncomplete(response);
    return extractResponseText(response);
  }

  async stream(request: LlmRequest, handlers: LlmStreamHandlers): Promise<string> {
    appLogger.debug('[OpenAiClient.stream] Dispatching to OpenAI', {
      model: this.model,
      messages: request.messages.length,
      tools: request.tools?.length ?? 0,
      reasoningEffort: request.reasoningEffort ?? null
    });
    let fullText = '';
    const streamedToolItemIds = new Set<string>();
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

    stream.on('response.function_call_arguments.done', (event) => {
      if (!handlers.onToolCall || streamedToolItemIds.has(event.item_id)) {
        return;
      }
      // The streaming event may arrive before the function name is resolved.
      // When name is missing, skip and let emitToolCalls handle it from the
      // final response where names are always populated.
      if (!event.name) {
        return;
      }
      streamedToolItemIds.add(event.item_id);
      handlers.onToolCall({
        name: event.name,
        args: parseToolArguments(event.arguments),
        rawArgsText: event.arguments
      });
    });

    const response = await stream.finalResponse();
    this.logIfIncomplete(response);

    emitToolCalls(response, handlers, streamedToolItemIds);

    if (handlers.onUsage && response.usage) {
      handlers.onUsage(response.usage as RawLlmUsage);
    }

    // Capture text from the final response that wasn't emitted via streaming
    // deltas. This can happen when the model produces text in a message output
    // item but no response.output_text.delta events were fired.
    if (!fullText && response.output_text?.trim()) {
      const finalText = response.output_text.trim();
      fullText = finalText;
      handlers.onToken(finalText);
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
    temperature: shouldSendTemperature(resolvedModel.id)
      ? (request.temperature ?? 0.3)
      : undefined,
    max_output_tokens: request.maxOutputTokens ?? 2048,
    store: false,
    tools,
    tool_choice: tools?.length ? toolChoice : undefined,
    reasoning: supportsResolvedReasoning
      ? {
          effort: reasoningEffort,
          summary: 'concise'
        }
      : undefined,
    text: request.responseMimeType === 'application/json'
      ? { format: { type: 'json_object' } }
      : undefined
  };
}

function shouldSendTemperature(modelId: string): boolean {
  if (!modelId.startsWith('gpt-5')) {
    return true;
  }

  // Keep GPT-5 request construction uniform across the supported catalog by omitting
  // temperature entirely and letting the model-specific reasoning profile drive behavior.
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
    reasoningEffort: request.reasoningEffort
  });
}

function supportsReasoningValue(modelId: string, value: string): boolean {
  const model = resolveCatalogModel(modelId);
  return model.reasoningEfforts.includes(value as (typeof model.reasoningEfforts)[number]);
}

function emitToolCalls(
  response: Responses.Response,
  handlers: LlmStreamHandlers,
  streamedToolItemIds: Set<string>
) {
  if (!handlers.onToolCall) {
    return;
  }

  for (const item of response.output ?? []) {
    if (item.type !== 'function_call') {
      continue;
    }
    if (item.id && streamedToolItemIds.has(item.id)) {
      continue;
    }

    const toolCall: LlmToolCall = {
      name: item.name,
      args: parseToolArguments(item.arguments),
      rawArgsText: item.arguments
    };
    handlers.onToolCall(toolCall);
  }
}

function parseToolArguments(argumentsJson: string | undefined): Record<string, unknown> {
  if (!argumentsJson) {
    return {};
  }
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

function extractResponseText(response: Responses.Response): string {
  if (response.output_text?.trim()) {
    return response.output_text;
  }

  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== 'message') {
      continue;
    }

    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('').trim();
}
