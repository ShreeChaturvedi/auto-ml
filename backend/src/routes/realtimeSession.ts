import { Router, type Response } from 'express';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';

export function createRealtimeSessionRouter(): Router {
  const router = Router();

  router.post('/realtime/session', requireAuth, asyncHandler(async (_req: AuthRequest, res: Response) => {
    if (!env.openaiApiKey) {
      res.status(503).json({ error: 'OpenAI API key is not configured' });
      return;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/realtime/transcription_sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'gpt-4o-transcribe',
            language: 'en',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 1000,
          },
          input_audio_noise_reduction: {
            type: 'near_field',
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        appLogger.error('[realtimeSession] OpenAI API error:', response.status, errorBody);
        res.status(response.status).json({
          error: `OpenAI API error: ${response.statusText}`,
        });
        return;
      }

      const data = (await response.json()) as { client_secret?: { value?: string; expires_at?: number } };
      const secret = data.client_secret;

      if (!secret?.value) {
        res.status(502).json({ error: 'Invalid response from OpenAI: missing client_secret' });
        return;
      }

      res.json({
        clientSecret: secret.value,
        expiresAt: secret.expires_at ?? 0,
      });
    } catch (error) {
      appLogger.error('[realtimeSession] Failed to create transcription session:', error);
      res.status(500).json({ error: 'Failed to create transcription session' });
    }
  }));

  return router;
}
