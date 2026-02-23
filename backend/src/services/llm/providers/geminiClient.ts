import type { LlmClient, LlmRequest, LlmStreamHandlers, LlmToolCall } from '../llmClient.js';

interface GeminiClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

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
    const body = buildGeminiBody(request);
    const response = await this.fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
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
    const body = buildGeminiBody(request);

    // DEBUG: Log the full request body
    console.log('[DEBUG][geminiClient.stream] Request body:', JSON.stringify(body, null, 2));

    const response = await this.fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      console.error('[DEBUG][geminiClient.stream] HTTP error:', response.status, text);
      throw new Error(text || `Gemini stream failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const pendingToolCalls: GeminiToolCall[] = [];
    const debugInfo: GeminiStreamDebug = {};
    const allChunks: unknown[] = []; // DEBUG: Capture all response chunks

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
          allChunks.push(json); // DEBUG: Save chunk
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
            allChunks.push(json); // DEBUG: Save chunk
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
      // DEBUG: Log EVERYTHING when this error occurs
      console.error('[DEBUG][geminiClient.stream] MALFORMED_FUNCTION_CALL or empty response');
      console.error('[DEBUG] Full request body was:', JSON.stringify(body, null, 2));
      console.error('[DEBUG] All response chunks:', JSON.stringify(allChunks, null, 2));
      console.error('[DEBUG] debugInfo:', JSON.stringify(debugInfo, null, 2));
      console.error('[DEBUG] pendingToolCalls:', JSON.stringify(pendingToolCalls, null, 2));
      console.error('[DEBUG] fullText:', fullText);
      console.warn(`[llm][gemini] Empty/failed response (${reason})`, debugInfo);
      // Throw explicit error so callers can handle gracefully
      if (debugInfo.finishReason === 'MALFORMED_FUNCTION_CALL') {
        throw new Error('Gemini failed to generate valid function call. Try simplifying your request.');
      }
    }

    return fullText;
  }

  private async fetchWithTimeout(input: string, init: RequestInit) {
    if (!this.apiKey) {
      throw new Error('Gemini API key is missing. Set GEMINI_API_KEY or LLM_API_KEY.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildGeminiBody(request: LlmRequest) {
  const system = request.messages.find((msg) => msg.role === 'system');

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
  const historyLen = Math.max(request.toolCallHistory?.length ?? 0, request.toolResultHistory?.length ?? 0);
  for (let i = 0; i < historyLen; i++) {
    if (request.toolCallHistory?.[i]) {
      const call = request.toolCallHistory[i];
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

    if (request.toolResultHistory?.[i]) {
      const result = request.toolResultHistory[i];
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: result.name,
            response: result.response
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

  const body = {
    contents,
    systemInstruction: system ? { parts: [{ text: system.content }] } : undefined,
    generationConfig: {
      temperature: request.temperature ?? 0.3,
      maxOutputTokens: request.maxOutputTokens ?? 2048,
      responseMimeType: request.responseMimeType,
      // Enable thinking mode for Gemini 3 models when explicitly requested
      ...(request.enableThinking ? {
        thinkingConfig: {
          thinkingLevel: 'HIGH',
          includeThoughts: true
        }
      } : {})
    },
    tools,
    toolConfig
  };

  console.log('[DEBUG][buildGeminiBody] generationConfig:', JSON.stringify(body.generationConfig, null, 2));

  return body;
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

    // DEBUG: Log what Gemini returns
    console.log('[DEBUG][extractGeminiFunctionCalls] Parts received:', JSON.stringify(parts, null, 2));

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
    if (last && last.name === call.name) {
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
