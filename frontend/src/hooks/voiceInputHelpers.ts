export interface RealtimeTranscriptMessage {
  type: string;
  item_id?: string;
  previous_item_id?: string | null;
  delta?: string;
  transcript?: string;
}

export interface PendingVoiceStartResources {
  stream?: MediaStream | null;
  audioContext?: AudioContext | null;
  ws?: WebSocket | null;
}

export const SAMPLE_RATE = 24000;
export const STOP_FLUSH_TIMEOUT_MS = 1500;
export const TURN_DETECTION = {
  type: 'server_vad' as const,
  threshold: 0.5,
  prefix_padding_ms: 300,
  silence_duration_ms: 1000,
};

export function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  const parts: string[] = [];

  for (let index = 0; index < bytes.length; index += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }

  return btoa(parts.join(''));
}

export function closeRealtimeSocket(ws: WebSocket | null): void {
  if (!ws) {
    return;
  }

  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;

  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close();
  }
}

export function closeAudioContext(audioContext: AudioContext | null): void {
  if (!audioContext) {
    return;
  }

  void audioContext.close().catch(() => {});
}

export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function cleanupPendingVoiceStart({
  stream,
  audioContext,
  ws,
}: PendingVoiceStartResources): void {
  closeRealtimeSocket(ws ?? null);
  closeAudioContext(audioContext ?? null);
  stopMediaStream(stream ?? null);
}

export function parseRealtimeTranscriptMessage(rawMessage: string): RealtimeTranscriptMessage | null {
  try {
    return JSON.parse(rawMessage) as RealtimeTranscriptMessage;
  } catch {
    return null;
  }
}
