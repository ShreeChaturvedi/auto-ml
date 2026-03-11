export function normalizeLlmStreamErrorMessage(
  error: unknown,
  kind: 'feature_engineering' | 'training' | 'onboarding' | 'preprocessing'
): string {
  const fallback = error instanceof Error ? error.message : 'LLM request failed';
  const raw = typeof fallback === 'string' ? fallback : 'LLM request failed';
  const trimmed = raw.trim();

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
  const parsedError = parsedRoot && parsedRoot.error && typeof parsedRoot.error === 'object' && !Array.isArray(parsedRoot.error)
    ? parsedRoot.error as Record<string, unknown>
    : null;

  const code = typeof parsedError?.code === 'number'
    ? parsedError.code
    : typeof parsedRoot?.code === 'number'
      ? parsedRoot.code
      : undefined;
  const status = typeof parsedError?.status === 'string'
    ? parsedError.status
    : typeof parsedRoot?.status === 'string'
      ? parsedRoot.status
      : undefined;
  const message = typeof parsedError?.message === 'string'
    ? parsedError.message
    : typeof parsedRoot?.message === 'string'
      ? parsedRoot.message
      : undefined;

  const fingerprint = `${trimmed}\n${status ?? ''}\n${message ?? ''}`.toLowerCase();
  const isQuotaFailure = code === 429
    || fingerprint.includes('resource_exhausted')
    || fingerprint.includes('quota exceeded')
    || fingerprint.includes('rate limit');

  if (isQuotaFailure) {
    if (kind === 'preprocessing') {
      return 'OpenAI rate limit or quota reached (429). This preprocessing request was not completed. Check API quota/billing and retry.';
    }
    return 'OpenAI rate limit or quota reached (429). Check API quota/billing and retry.';
  }

  const isModelUnavailable = code === 503
    || fingerprint.includes('unavailable')
    || fingerprint.includes('high demand')
    || fingerprint.includes('timed out')
    || fingerprint.includes('timeout');
  if (isModelUnavailable) {
    const providerMessage = message?.trim() || raw;
    const guidance = 'Current model is unavailable or timing out. Please choose a different model in the model selector and retry.';
    return `${providerMessage} ${guidance}`.trim();
  }

  if (message && message.trim()) {
    return message.trim();
  }

  return raw;
}
