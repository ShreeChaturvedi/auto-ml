import type {
  LlmClient,
  LlmRequest,
  LlmStreamHandlers,
  LlmThinkingLevel,
  LlmToolCall
} from '../llmClient.js';

interface GeminiClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

const MAX_STREAM_RETRY_ATTEMPTS = 1;
const STREAM_RETRY_BACKOFF_MS = 1200;

export class GeminiClient implements LlmClient {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(options: GeminiClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
  }

  async complete(request: LlmRequest): Promise<string> {
    const body = buildGeminiBody(request, this.model);
    const response = await this.fetchWithTimeout(
      this.modelRequestUrl(this.model, false),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Gemini request failed (${response.status})`);
    }

    const payload = await response.json();
    return extractGeminiText(payload);
  }

  async stream(request: LlmRequest, handlers: LlmStreamHandlers): Promise<string> {
    return this.streamWithModel(request, handlers, this.model, 0);
  }

  private async streamWithModel(
    request: LlmRequest,
    handlers: LlmStreamHandlers,
    model: string,
    retryAttempt: number
  ): Promise<string> {
    const body = buildGeminiBody(request, model);

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        this.modelRequestUrl(model, true),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
    } catch (error) {
      if (shouldRetryStreamRequest(error, retryAttempt)) {
        const delayMs = STREAM_RETRY_BACKOFF_MS * (retryAttempt + 1);
        console.warn(
          `[llm][gemini] Stream request timed out on model ${model}. Retrying once after ${delayMs}ms (attempt ${retryAttempt + 1}/${MAX_STREAM_RETRY_ATTEMPTS}).`
        );
        await sleep(delayMs);
        return this.streamWithModel(request, handlers, model, retryAttempt + 1);
      }
      throw error;
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      if (shouldRetryStreamStatus(response.status, retryAttempt)) {
        const delayMs = STREAM_RETRY_BACKOFF_MS * (retryAttempt + 1);
        console.warn(
          `[llm][gemini] Stream request failed with ${response.status} on model ${model}. Retrying once after ${delayMs}ms (attempt ${retryAttempt + 1}/${MAX_STREAM_RETRY_ATTEMPTS}).`
        );
        await sleep(delayMs);
        return this.streamWithModel(request, handlers, model, retryAttempt + 1);
      }
      throw new Error(text || `Gemini stream failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const pendingToolCalls: GeminiToolCall[] = [];
    const debugInfo: GeminiStreamDebug = {};
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Handle SSE format: data: {...}
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const chunk = extractGeminiText(json);
          if (chunk) {
            fullText += chunk;
            handlers.onToken(chunk);
          }
          // Extract and emit thinking tokens
          const thinkingChunk = extractGeminiThoughts(json);
          if (thinkingChunk && handlers.onThinking) {
            handlers.onThinking(thinkingChunk);
          }
          updateGeminiDebug(debugInfo, json);
          const toolCalls = extractGeminiFunctionCalls(json, request.contextId);
          mergeToolCalls(pendingToolCalls, toolCalls);
        } catch {
          // Ignore malformed chunks.
        }
      }
    }

    if (buffer.trim()) {
      const tail = buffer.trim();
      if (tail.startsWith('data:')) {
        const data = tail.slice(5).trim();
        if (data && data !== '[DONE]') {
          try {
            const json = JSON.parse(data);
            const chunk = extractGeminiText(json);
            if (chunk) {
              fullText += chunk;
              handlers.onToken(chunk);
            }
            // Extract and emit thinking tokens from tail
            const thinkingChunk = extractGeminiThoughts(json);
            if (thinkingChunk && handlers.onThinking) {
              handlers.onThinking(thinkingChunk);
            }
            updateGeminiDebug(debugInfo, json);
            const toolCalls = extractGeminiFunctionCalls(json, request.contextId);
            mergeToolCalls(pendingToolCalls, toolCalls);
          } catch {
            // Ignore malformed tail.
          }
        }
      }
    }

    if (pendingToolCalls.length > 0 && handlers.onToolCall) {
      finalizeToolCalls(pendingToolCalls).forEach((call) => handlers.onToolCall?.(call));
    } else if (!fullText || debugInfo.finishReason === 'MALFORMED_FUNCTION_CALL') {
      const reason = debugInfo.finishReason || 'unknown';
      console.warn(`[llm][gemini] Empty/failed response (${reason})`, debugInfo);
      // Throw explicit error so callers can handle gracefully
      if (debugInfo.finishReason === 'MALFORMED_FUNCTION_CALL') {
        throw new Error('Gemini failed to generate valid function call. Try simplifying your request.');
      }

      if (debugInfo.finishReason === 'MAX_TOKENS' && retryAttempt < 1) {
        const retryRequest: LlmRequest = {
          ...request,
          maxOutputTokens: Math.max(request.maxOutputTokens ?? 2048, 4096),
          thinkingLevel: 'low',
          enableThinking: false
        };
        console.warn('[llm][gemini] Retrying after MAX_TOKENS with reduced reasoning profile.');
        return this.streamWithModel(retryRequest, handlers, model, retryAttempt + 1);
      }
    }

    return fullText;
  }

  private modelRequestUrl(model: string, stream: boolean): string {
    return stream
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
  }

  private async fetchWithTimeout(input: string, init: RequestInit) {
    if (!this.apiKey) {
      throw new Error('Gemini API key is missing. Set GEMINI_API_KEY or LLM_API_KEY.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(`Gemini request timed out after ${this.timeoutMs}ms.`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function shouldRetryStreamStatus(statusCode: number, retryAttempt: number): boolean {
  return retryAttempt < MAX_STREAM_RETRY_ATTEMPTS && statusCode === 503;
}

function shouldRetryStreamRequest(error: unknown, retryAttempt: number): boolean {
  return retryAttempt < MAX_STREAM_RETRY_ATTEMPTS
    && error instanceof Error
    && error.name === 'TimeoutError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGeminiBody(request: LlmRequest, model: string) {
  const system = request.messages.find((msg) => msg.role === 'system');
  const MAX_HISTORY_ITEMS = 8;
  const toolCallHistory = request.toolCallHistory?.slice(-MAX_HISTORY_ITEMS);
  const toolResultHistory = request.toolResultHistory?.slice(-MAX_HISTORY_ITEMS);

  // Type the parts to support text, functionCall, and functionResponse
  type GeminiPart =
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
    | { functionResponse: { name: string; response: Record<string, unknown> } };

  const contents: Array<{ role: string; parts: GeminiPart[] }> = request.messages
    .filter((msg) => msg.role !== 'system')
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }] as GeminiPart[]
    }));

  // Interleave tool calls and results to support sequential history
  const historyLen = Math.max(toolCallHistory?.length ?? 0, toolResultHistory?.length ?? 0);
  for (let i = 0; i < historyLen; i++) {
    if (toolCallHistory?.[i]) {
      const call = toolCallHistory[i];
      contents.push({
        role: 'model',
        parts: [{
          functionCall: {
            name: call.name,
            args: call.args ?? {}
          },
          // Include thoughtSignature for Gemini 3 thinking models
          ...(call.thoughtSignature
            ? { thoughtSignature: call.thoughtSignature }
            : (request.contextId && signatureCache.get(request.contextId)
              ? { thoughtSignature: signatureCache.get(request.contextId) }
              : {})
          )
        }] as GeminiPart[]
      });
    }

    if (toolResultHistory?.[i]) {
      const result = toolResultHistory[i];
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: result.name,
            response: compactFunctionResponse(result.response)
          }
        }] as GeminiPart[]
      });
    }
  }

  const tools = request.tools?.length
    ? [
      {
        functionDeclarations: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: sanitizeGeminiSchema(tool.parameters)
        }))
      }
    ]
    : undefined;

  const toolNames = request.tools?.map((tool) => tool.name).filter(Boolean) ?? [];
  const toolConfig = request.toolChoice && toolNames.length
    ? {
      functionCallingConfig: {
        mode: request.toolChoice.toUpperCase(),
        // allowedFunctionNames is only valid for ANY mode, not AUTO
        ...(request.toolChoice.toLowerCase() === 'any' ? { allowedFunctionNames: toolNames } : {})
      }
    }
    : undefined;

  const thinkingConfig = buildThinkingConfig(request, model);

  const body = {
    contents,
    systemInstruction: system ? { parts: [{ text: system.content }] } : undefined,
    generationConfig: {
      temperature: request.temperature ?? 0.3,
      maxOutputTokens: request.maxOutputTokens ?? 2048,
      responseMimeType: request.responseMimeType,
      ...(thinkingConfig ? { thinkingConfig } : {})
    },
    tools,
    toolConfig
  };

  return body;
}

function compactFunctionResponse(response: Record<string, unknown>): Record<string, unknown> {
  const MAX_RESPONSE_CHARS = 2500;
  try {
    const serialized = JSON.stringify(response);
    if (serialized.length <= MAX_RESPONSE_CHARS) {
      return response;
    }

    return {
      truncated: true,
      preview: `${serialized.slice(0, MAX_RESPONSE_CHARS)}…`,
      originalSize: serialized.length
    };
  } catch {
    return response;
  }
}

function buildThinkingConfig(request: LlmRequest, model: string) {
  // Explicitly disable thinking payload when callers turn it off.
  if (request.enableThinking === false) {
    return undefined;
  }

  if (!supportsThinkingConfig(model)) {
    return undefined;
  }

  const explicitLevel = toGeminiThinkingLevel(request.thinkingLevel);
  if (explicitLevel && supportsExplicitThinkingLevel(model)) {
    return {
      thinkingLevel: explicitLevel,
      includeThoughts: true
    };
  }

  if (request.enableThinking) {
    return {
      includeThoughts: true
    };
  }

  return undefined;
}

function supportsThinkingConfig(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes('gemini-2.5')
    || normalized.includes('gemini-3.1-pro')
    || normalized.includes('thinking');
}

function supportsExplicitThinkingLevel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes('gemini-2.5')
    || normalized.includes('gemini-3.1-pro')
    || normalized.includes('thinking');
}

function toGeminiThinkingLevel(level?: LlmThinkingLevel): 'LOW' | 'MEDIUM' | 'HIGH' | undefined {
  switch (level) {
    case 'low':
      return 'LOW';
    case 'medium':
      return 'MEDIUM';
    case 'high':
      return 'HIGH';
    default:
      return undefined;
  }
}

function extractGeminiText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }).candidates;
  if (!Array.isArray(candidates)) return '';
  const parts = candidates.flatMap((candidate) => candidate.content?.parts ?? []);
  // Only return non-thought text parts
  return parts.filter((part) => !part.thought).map((part) => part.text ?? '').join('');
}

function extractGeminiThoughts(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }).candidates;
  if (!Array.isArray(candidates)) return '';
  const parts = candidates.flatMap((candidate) => candidate.content?.parts ?? []);
  // Only return thought parts
  return parts.filter((part) => part.thought === true).map((part) => part.text ?? '').join('');
}

type GeminiToolCall = {
  name: string;
  args: Record<string, unknown>;
  rawArgs?: string;
  thoughtSignature?: string;
};

type GeminiStreamDebug = {
  finishReason?: string;
  blockReason?: string;
  promptFeedback?: unknown;
  safetyRatings?: unknown;
  usageMetadata?: unknown;
};

function updateGeminiDebug(debug: GeminiStreamDebug, payload: unknown) {
  if (!payload || typeof payload !== 'object') return;
  const typed = payload as {
    promptFeedback?: unknown;
    usageMetadata?: unknown;
    candidates?: Array<{ finishReason?: string; safetyRatings?: unknown }>;
  };
  if (typed.promptFeedback) debug.promptFeedback = typed.promptFeedback;
  if (typed.usageMetadata) debug.usageMetadata = typed.usageMetadata;
  const candidate = typed.candidates?.[0];
  if (candidate?.finishReason) debug.finishReason = candidate.finishReason;
  if (candidate?.safetyRatings) debug.safetyRatings = candidate.safetyRatings;
  if (typed.promptFeedback && typeof typed.promptFeedback === 'object') {
    const feedback = typed.promptFeedback as { blockReason?: string };
    if (feedback.blockReason) debug.blockReason = feedback.blockReason;
  }
}

const signatureCache = new Map<string, string>();

function extractGeminiFunctionCalls(payload: unknown, contextId?: string): GeminiToolCall[] {
  if (!payload || typeof payload !== 'object') return [];
  const candidates = (payload as {
    candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>;
  }).candidates;
  if (!Array.isArray(candidates)) return [];

  const calls: GeminiToolCall[] = [];

  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];

    // First pass: find the last thoughtSignature in the response
    // Gemini 3 may return signature on a separate text part at the end
    let lastSignature: string | undefined;
    for (const part of parts) {
      const sig = part.thoughtSignature ?? part.thought_signature;
      if (typeof sig === 'string' && sig) {
        lastSignature = sig;
        // Cache the signature if contextId is provided
        if (contextId) {
          signatureCache.set(contextId, sig);
        }
      }
    }



    // Second pass: extract function calls
    for (const part of parts) {
      const functionCall =
        (part.functionCall as { name?: string; args?: unknown }) ??
        (part.function_call as { name?: string; args?: unknown }) ??
        (part.toolCall as { name?: string; args?: unknown }) ??
        (part.tool_call as { name?: string; args?: unknown });

      if (!functionCall?.name) continue;

      const { args, rawArgs } = normalizeToolArgs(functionCall.args);

      // Check if this specific part has a signature (for parallel function calls)
      const partSignature = (part.thoughtSignature ?? part.thought_signature) as string | undefined;

      // For first function call in this candidate, attach the signature
      // If the part has its own signature, use that; otherwise use lastSignature for the first call
      const signatureToUse = partSignature || (calls.length === 0 ? lastSignature : undefined);



      calls.push({
        name: functionCall.name,
        args,
        rawArgs,
        thoughtSignature: signatureToUse
      });
    }
  }
  return calls;
}

function normalizeToolArgs(args: unknown): { args: Record<string, unknown>; rawArgs?: string } {
  if (typeof args === 'string') {
    const parsed = parseJsonObject(args);
    if (parsed) {
      return { args: parsed };
    }
    return { args: {}, rawArgs: args };
  }
  if (args && typeof args === 'object') {
    return { args: args as Record<string, unknown> };
  }
  return { args: {} };
}

function mergeToolCalls(target: GeminiToolCall[], incoming: GeminiToolCall[]) {
  for (const call of incoming) {
    const last = target[target.length - 1];
    if (last && last.name === call.name && shouldMergeToolCallFragments(last, call)) {
      last.args = deepMerge(last.args, call.args);
      last.rawArgs = mergeRawArgs(last.rawArgs, call.rawArgs);
      // Keep the thoughtSignature if present (don't overwrite with undefined)
      if (call.thoughtSignature) last.thoughtSignature = call.thoughtSignature;
    } else {
      target.push({
        name: call.name,
        args: call.args,
        rawArgs: call.rawArgs,
        thoughtSignature: call.thoughtSignature
      });
    }
  }
}

function shouldMergeToolCallFragments(previous: GeminiToolCall, next: GeminiToolCall): boolean {
  // If any side has raw partial args, this is almost certainly a fragmented stream payload.
  if (previous.rawArgs || next.rawArgs) {
    return true;
  }

  const previousKeys = Object.keys(previous.args);
  const nextKeys = Object.keys(next.args);

  // Empty-object tool args are commonly emitted incrementally.
  if (previousKeys.length === 0 || nextKeys.length === 0) {
    return true;
  }

  // Merge only when one arg object is a subset of the other (progressive construction).
  // Distinct calls with the same tool name but different arguments should remain separate.
  return isSubsetArgs(previous.args, next.args) || isSubsetArgs(next.args, previous.args);
}

function isSubsetArgs(
  subset: Record<string, unknown>,
  superset: Record<string, unknown>
): boolean {
  return Object.entries(subset).every(([key, value]) => {
    if (!(key in superset)) {
      return false;
    }
    return jsonValueEquals(value, superset[key]);
  });
}

function jsonValueEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof merged[key] === 'object' &&
      merged[key] &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = deepMerge(merged[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function mergeRawArgs(previous?: string, next?: string) {
  if (!previous) return next;
  if (!next) return previous;
  if (next.startsWith(previous)) return next;
  if (previous.startsWith(next)) return previous;
  return previous + next;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    const trimmed = value.trim();
    const endIndex = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (endIndex > 0) {
      try {
        const sliced = trimmed.slice(0, endIndex + 1);
        const parsed = JSON.parse(sliced);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function finalizeToolCalls(calls: GeminiToolCall[]): LlmToolCall[] {
  return calls.map((call) => {
    let args = call.args;
    if (call.rawArgs) {
      const parsed = parseJsonObject(call.rawArgs);
      if (parsed) args = parsed;
    }
    return {
      name: call.name,
      args,
      thoughtSignature: call.thoughtSignature
    };
  });
}

function sanitizeGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) {
    return schema.map((entry) => sanitizeGeminiSchema(entry));
  }
  const disallowedKeys = new Set(['$schema', 'additionalProperties']);
  const entries = Object.entries(schema as Record<string, unknown>);
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (disallowedKeys.has(key)) continue;
    sanitized[key] = sanitizeGeminiSchema(value);
  }
  return sanitized;
}
