import { apiRequest } from './client';

interface RealtimeSessionResponse {
  clientSecret: string;
  expiresAt: number;
}

export async function createRealtimeSession(): Promise<RealtimeSessionResponse> {
  return apiRequest<RealtimeSessionResponse>('/realtime/session', {
    method: 'POST',
  });
}
