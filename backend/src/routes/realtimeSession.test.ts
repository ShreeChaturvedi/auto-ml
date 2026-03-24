import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  hasDatabaseConfigurationMock,
  getDbPoolMock,
  verifyAccessTokenMock,
  findByIdMock,
} = vi.hoisted(() => ({
  hasDatabaseConfigurationMock: vi.fn(),
  getDbPoolMock: vi.fn(() => ({})),
  verifyAccessTokenMock: vi.fn(),
  findByIdMock: vi.fn(),
}));

vi.mock('../db.js', () => ({
  hasDatabaseConfiguration: hasDatabaseConfigurationMock,
  getDbPool: getDbPoolMock,
}));

vi.mock('../repositories/userRepository.js', () => {
  return {
    UserRepository: class MockUserRepository {
      findById = findByIdMock;
    },
  };
});

vi.mock('../services/authService.js', () => ({
  authService: {
    verifyAccessToken: verifyAccessTokenMock,
  },
}));

vi.mock('../config.js', async () => {
  const actual = await vi.importActual<typeof import('../config.js')>('../config.js');
  return {
    ...actual,
    env: {
      ...actual.env,
      openaiApiKey: 'test-openai-key',
    },
  };
});

import { env } from '../config.js';
import { describeRouteSuite } from '../tests/describeRouteSuite.js';
import { TEST_USER } from '../tests/fixtures.js';

import { createRealtimeSessionRouter } from './realtimeSession.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createRealtimeSessionRouter());
  return app;
}

describeRouteSuite('realtime session routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());

    hasDatabaseConfigurationMock.mockReturnValue(true);
    verifyAccessTokenMock.mockReturnValue({
      userId: TEST_USER.user_id,
      email: TEST_USER.email,
      role: TEST_USER.role,
    });
    findByIdMock.mockResolvedValue(TEST_USER);
    env.openaiApiKey = 'test-openai-key';
  });

  describe('POST /api/realtime/session', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const app = createTestApp();
      const response = await request(app).post('/api/realtime/session');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('returns 503 when authentication is not configured', async () => {
      hasDatabaseConfigurationMock.mockReturnValue(false);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/realtime/session')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Authentication is not configured');
    });

    it('returns 503 when the OpenAI API key is missing', async () => {
      env.openaiApiKey = '';

      const app = createTestApp();
      const response = await request(app)
        .post('/api/realtime/session')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('OpenAI API key is not configured');
    });

    it('propagates upstream API failures', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: vi.fn().mockResolvedValue('rate limited'),
      } as unknown as Response);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/realtime/session')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('OpenAI API error: Too Many Requests');
    });

    it('returns 502 when the upstream payload is missing a client secret', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ client_secret: {} }),
      } as unknown as Response);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/realtime/session')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(502);
      expect(response.body.error).toBe('Invalid response from OpenAI: missing client_secret');
    });

    it('returns the client secret when the upstream request succeeds', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          client_secret: {
            value: 'secret-123',
            expires_at: 1_762_345_678,
          },
        }),
      } as unknown as Response);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/realtime/session')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        clientSecret: 'secret-123',
        expiresAt: 1_762_345_678,
      });
      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/realtime/transcription_sessions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });
  });
});
