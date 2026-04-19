import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  RateLimitError
} from 'openai';

export type LlmStreamErrorCode =
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_MODEL_UNAVAILABLE'
  | 'UPSTREAM_AUTH_FAILED'
  | 'UPSTREAM_TIMEOUT'
  | 'WORKFLOW_BUDGET_EXHAUSTED'
  | 'UPSTREAM_UNKNOWN';

export interface NormalizedLlmStreamError {
  message: string;
  code: LlmStreamErrorCode;
  retryable: boolean;
  status?: number;
}

/**
 * Normalize an error thrown during an LLM stream into a structured shape
 * with a stable code the frontend can map to friendly UI copy.
 *
 * Detection order:
 *   1. OpenAI SDK error classes (instanceof) — most reliable
 *   2. Status code on APIError subclass
 *   3. JSON-encoded error bodies in the message string (fallback for
 *      providers that bubble raw response bodies)
 */
export function normalizeLlmStreamError(error: unknown): NormalizedLlmStreamError {
  // 1. Detect via OpenAI SDK typed errors.
  if (error instanceof RateLimitError) {
    return {
      message:
        'OpenAI rate limit reached (429). The provider is throttling requests for this API key. This is a short-term burst limit, not a billing quota issue. Please wait a few seconds and retry.',
      code: 'UPSTREAM_RATE_LIMITED',
      retryable: true,
      status: error.status
    };
  }

  if (error instanceof AuthenticationError) {
    return {
      message:
        'OpenAI authentication failed. The server API key is invalid or missing — contact your administrator.',
      code: 'UPSTREAM_AUTH_FAILED',
      retryable: false,
      status: error.status
    };
  }

  if (error instanceof APIConnectionTimeoutError) {
    return {
      message: 'The model provider timed out. Retry, or switch to a faster model from the model selector.',
      code: 'UPSTREAM_TIMEOUT',
      retryable: true
    };
  }

  if (error instanceof APIConnectionError) {
    return {
      message: 'Could not reach the model provider. Retry in a moment.',
      code: 'UPSTREAM_MODEL_UNAVAILABLE',
      retryable: true
    };
  }

  if (error instanceof APIError) {
    if (error.status === 429) {
      return {
        message:
          'OpenAI rate limit reached (429). The provider is throttling requests for this API key. Please wait a few seconds and retry.',
        code: 'UPSTREAM_RATE_LIMITED',
        retryable: true,
        status: 429
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        message: 'OpenAI authentication failed. The server API key is invalid or lacks permission.',
        code: 'UPSTREAM_AUTH_FAILED',
        retryable: false,
        status: error.status
      };
    }
    if (error.status === 503 || error.status === 502 || error.status === 504) {
      return {
        message: 'The model provider is temporarily unavailable. Please retry, or switch to a different model.',
        code: 'UPSTREAM_MODEL_UNAVAILABLE',
        retryable: true,
        status: error.status
      };
    }
  }

  // 2. Fallback: parse raw error bodies for providers that bubble JSON strings.
  const raw = error instanceof Error ? error.message : 'LLM request failed';
  const trimmed = typeof raw === 'string' ? raw.trim() : 'LLM request failed';

  const parseJsonError = (value: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parsedRoot = parseJsonError(trimmed);
  const parsedError =
    parsedRoot && parsedRoot.error && typeof parsedRoot.error === 'object' && !Array.isArray(parsedRoot.error)
      ? (parsedRoot.error as Record<string, unknown>)
      : null;

  const code =
    typeof parsedError?.code === 'number'
      ? parsedError.code
      : typeof parsedRoot?.code === 'number'
        ? parsedRoot.code
        : undefined;
  const message =
    typeof parsedError?.message === 'string'
      ? parsedError.message
      : typeof parsedRoot?.message === 'string'
        ? parsedRoot.message
        : undefined;

  const fingerprint = `${trimmed}\n${message ?? ''}`.toLowerCase();

  if (
    code === 429
    || fingerprint.includes('resource_exhausted')
    || fingerprint.includes('quota exceeded')
    || fingerprint.includes('rate limit')
  ) {
    return {
      message:
        'OpenAI rate limit reached (429). The provider is throttling requests. This is a short-term burst limit, not a billing quota issue. Please retry.',
      code: 'UPSTREAM_RATE_LIMITED',
      retryable: true
    };
  }

  if (code === 503 || fingerprint.includes('unavailable') || fingerprint.includes('high demand')) {
    return {
      message: `${message?.trim() || raw} — please switch models or retry.`.trim(),
      code: 'UPSTREAM_MODEL_UNAVAILABLE',
      retryable: true
    };
  }

  if (fingerprint.includes('timed out') || fingerprint.includes('timeout')) {
    return {
      message: 'The model provider timed out. Retry, or switch to a faster model.',
      code: 'UPSTREAM_TIMEOUT',
      retryable: true
    };
  }

  // LangGraph's GraphRecursionError surfaces when the graph hits its
  // internal step budget before the workflow's MAX_WORKFLOW_ITERATIONS
  // cap fires (typically because deterministic stage hops cycle the graph
  // without advancing `iteration`). Surface a specific, actionable code
  // instead of the generic UPSTREAM_UNKNOWN fallback. Issue #340.
  if (
    fingerprint.includes('recursion limit')
    || fingerprint.includes('graphrecursionerror')
  ) {
    return {
      message:
        'The preprocessing run ran too many steps without finishing. Try simplifying your request, breaking it into smaller steps, or starting over on a fresh workbook.',
      code: 'WORKFLOW_BUDGET_EXHAUSTED',
      retryable: true
    };
  }

  return {
    message: message?.trim() || raw,
    code: 'UPSTREAM_UNKNOWN',
    retryable: true
  };
}
