/**
 * Shared NDJSON stream reader utility.
 *
 * Reads a `Response` body as a newline-delimited JSON stream and yields each
 * parsed object. Callers own all domain-specific logic (error handling,
 * envelope validation, side-effects on specific event types, etc.).
 *
 * @example
 * ```ts
 * for await (const event of readNdjsonStream<MyEvent>(response)) {
 *   handleEvent(event);
 * }
 * ```
 */
export async function* readNdjsonStream<T>(response: Response): AsyncGenerator<T> {
  // Caller is responsible for checking response.ok / response.body before calling this.
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          yield JSON.parse(trimmed) as T;
        } catch (error) {
          throw new SyntaxError(
            `Failed to parse NDJSON line: ${error instanceof Error ? error.message : 'unknown error'}`
          );
        }
      }
    }

    // Flush any bytes held back by the streaming TextDecoder, then process the
    // remaining buffer content (last line without a trailing newline).
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) {
      try {
        yield JSON.parse(tail) as T;
      } catch (error) {
        throw new SyntaxError(
          `Failed to parse NDJSON tail: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Consume an NDJSON token stream, accumulating `token` event content into a
 * string and invoking `onToken` after each append. Stops on `error` events
 * or if the optional `AbortSignal` fires.
 */
export async function accumulateTokenStream(
  response: Response,
  onToken: (accumulated: string) => void,
  signal?: AbortSignal
): Promise<void> {
  let accumulated = '';
  for await (const event of readNdjsonStream<{ type: string; content?: string }>(response)) {
    if (signal?.aborted) break;
    if (event.type === 'token' && event.content) {
      accumulated += event.content;
      onToken(accumulated);
    }
    if (event.type === 'error') break;
  }
}
