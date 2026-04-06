import { env } from '../../config.js';
import { appLogger } from '../../logging/logger.js';

import { getModelCatalogEntry, resolveCatalogModel, type LlmReasoningEffort } from './modelCatalog.js';
import { OpenAiClient } from './providers/openaiClient.js';

export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type LlmToolChoice = 'auto' | 'any' | 'none';

export interface LlmToolCall {
  name: string;
  args: Record<string, unknown>;
  rawArgsText?: string;
  thoughtSignature?: string;
}

export interface LlmToolCallHistory {
  name: string;
  args?: Record<string, unknown>;
  thoughtSignature?: string;
}

export interface LlmToolResultHistory {
  name: string;
  response: Record<string, unknown>;
}

export interface LlmRequest {
  messages: LlmMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  tools?: LlmToolDefinition[];
  toolChoice?: LlmToolChoice;
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  reasoningEffort?: LlmReasoningEffort;
  contextId?: string;
}

/** Raw OpenAI Responses API usage shape — passed through as-is to the frontend. */
export interface RawLlmUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

export interface LlmStreamHandlers {
  onToken: (token: string) => void;
  onToolCall?: (call: LlmToolCall) => void;
  onThinking?: (text: string) => void;
  onUsage?: (usage: RawLlmUsage) => void;
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<string>;
  stream(request: LlmRequest, handlers: LlmStreamHandlers): Promise<string>;
}

export function createLlmClient(modelOverride?: string, timeoutMsOverride?: number): LlmClient {
  const timeoutMs = timeoutMsOverride ?? env.llmTimeoutMs;
  const resolvedModel = resolveCatalogModel(modelOverride || env.llmModel);

  // Warn loudly when a caller asked for a specific model but it wasn't in the
  // catalog — this is how "user selected mini but backend used base" bugs
  // hide. Fallback is still served; the warn just makes it traceable.
  if (modelOverride && getModelCatalogEntry(modelOverride) == null) {
    appLogger.warn('[createLlmClient] Unknown model override; falling back to default', {
      requested: modelOverride,
      resolved: resolvedModel.id,
      envDefault: env.llmModel
    });
  }

  appLogger.info('[createLlmClient] Resolved LLM client', {
    override: modelOverride ?? null,
    resolved: resolvedModel.id,
    envDefault: env.llmModel,
    timeoutMs
  });

  return new OpenAiClient({
    apiKey: env.openaiApiKey,
    baseUrl: env.openaiBaseUrl,
    model: resolvedModel.id,
    timeoutMs
  });
}
