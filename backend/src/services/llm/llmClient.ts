import { env } from '../../config.js';
import { GeminiClient } from './providers/geminiClient.js';
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
  enableThinking?: boolean;
  contextId?: string;
}

export interface LlmStreamHandlers {
  onToken: (token: string) => void;
  onToolCall?: (call: LlmToolCall) => void;
  onThinking?: (text: string) => void;
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<string>;
  stream(request: LlmRequest, handlers: LlmStreamHandlers): Promise<string>;
}

export function createLlmClient(): LlmClient {
  const provider = env.llmProvider.toLowerCase();

  if (provider === 'openai') {
    return new OpenAiClient({
      apiKey: env.llmApiKey,
      baseUrl: env.llmBaseUrl,
      model: env.llmModel,
      timeoutMs: env.llmTimeoutMs
    });
  }

  return new GeminiClient({
    apiKey: env.geminiApiKey || env.llmApiKey,
    model: env.geminiModel || env.llmModel,
    timeoutMs: env.llmTimeoutMs
  });
}

export function createThinkingLlmClient(): LlmClient {
  // Thinking model is only supported for Gemini
  return new GeminiClient({
    apiKey: env.geminiApiKey || env.llmApiKey,
    model: env.geminiThinkingModel,
    timeoutMs: env.llmTimeoutMs * 2 // Double timeout for thinking model
  });
}
