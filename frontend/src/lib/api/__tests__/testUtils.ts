export function createNdjsonResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    }
  });

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' }
  });
}

export function getRequestHeader(init: RequestInit | undefined, headerName: string): string | null {
  return new Headers(init?.headers).get(headerName);
}
