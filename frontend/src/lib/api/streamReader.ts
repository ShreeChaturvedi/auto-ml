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
        yield JSON.parse(trimmed) as T;
      }
    }

    // Flush any bytes held back by the streaming TextDecoder, then process the
    // remaining buffer content (last line without a trailing newline).
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) {
      yield JSON.parse(tail) as T;
    }
  } finally {
    reader.releaseLock();
  }
}
