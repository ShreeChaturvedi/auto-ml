import type { LlmClient, LlmRequest, LlmStreamHandlers } from '../llmClient.js';

interface OpenAiClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class OpenAiClient implements LlmClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(options: OpenAiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, '') || 'http://localhost:11434';
    this.model = options.model || 'gpt-4o-mini';
    this.timeoutMs = options.timeoutMs;
  }

  async complete(request: LlmRequest): Promise<string> {
    const body = buildOpenAiBody(request, this.model, false);
    const response = await this.fetchWithTimeout(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `OpenAI-compatible request failed (${response.status})`);
    }

    const payload = await response.json();
    return extractOpenAiText(payload);
  }

  async stream(request: LlmRequest, handlers: LlmStreamHandlers): Promise<string> {
    const body = buildOpenAiBody(request, this.model, true);
    const response = await this.fetchWithTimeout(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `OpenAI-compatible stream failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = extractOpenAiDelta(json);
          if (delta) {
            fullText += delta;
            handlers.onToken(delta);
          }
        } catch {
          // Ignore malformed lines.
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
            const delta = extractOpenAiDelta(json);
            if (delta) {
              fullText += delta;
              handlers.onToken(delta);
            }
          } catch {
            // Ignore malformed tail.
          }
        }
      }
    }

    return fullText;
  }

  private buildHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async fetchWithTimeout(input: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildOpenAiBody(request: LlmRequest, model: string, stream: boolean) {
  const tools = request.tools?.length
    ? request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }))
    : undefined;

  const toolChoice = request.toolChoice
    ? request.toolChoice === 'any'
      ? 'required'
      : request.toolChoice
    : undefined;

  return {
    model,
    messages: request.messages.map((msg) => ({ role: msg.role, content: msg.content })),
    temperature: request.temperature ?? 0.3,
    max_tokens: request.maxOutputTokens ?? 2048,
    stream,
    tools,
    tool_choice: tools ? toolChoice : undefined,
    response_format: request.responseMimeType === 'application/json'
      ? { type: 'json_object' }
      : undefined
  };
}

function extractOpenAiText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
  if (!Array.isArray(choices)) return '';
  return choices.map((choice) => choice.message?.content ?? '').join('');
}

function extractOpenAiDelta(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: Array<{ delta?: { content?: string } }> }).choices;
  if (!Array.isArray(choices)) return '';
  return choices.map((choice) => choice.delta?.content ?? '').join('');
}
