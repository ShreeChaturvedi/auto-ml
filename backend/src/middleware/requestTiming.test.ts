import { EventEmitter } from 'node:events';

import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestTimingMiddleware } from './requestTiming.js';

class MockResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  private headers = new Map<string, string>();

  setHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  getHeader(name: string) {
    return this.headers.get(name);
  }

  writeHead(statusCode?: number) {
    if (typeof statusCode === 'number') {
      this.statusCode = statusCode;
    }

    this.headersSent = true;
    return this as unknown as Response;
  }
}

function createMockRequest() {
  return {
    method: 'GET',
    originalUrl: '/api/health',
    log: {
      info: vi.fn(),
      warn: vi.fn()
    }
  } as unknown as Request;
}

describe('requestTimingMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs normal requests at info level and sets the response time header', () => {
    const req = createMockRequest();
    const res = new MockResponse() as unknown as Response;
    const next = vi.fn();
    const times = [0n, 250_000_000n, 250_000_000n];
    const middleware = createRequestTimingMiddleware({
      now: () => times.shift() ?? 250_000_000n
    });

    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();

    (res as unknown as MockResponse).writeHead(200);
    (res as unknown as MockResponse).emit('finish');

    expect((res as unknown as MockResponse).getHeader('X-Response-Time')).toBe('250ms');
    expect(req.log.info).toHaveBeenCalledWith(
      {
        method: 'GET',
        path: '/api/health',
        statusCode: 200,
        durationMs: 250
      },
      'Request completed'
    );
    expect(req.log.warn).not.toHaveBeenCalled();
  });

  it('logs slow requests at warn level', () => {
    const req = createMockRequest();
    const res = new MockResponse() as unknown as Response;
    const next = vi.fn();
    const times = [0n, 1_250_000_000n];
    const middleware = createRequestTimingMiddleware({
      now: () => times.shift() ?? 1_250_000_000n
    });

    middleware(req, res, next);
    (res as unknown as MockResponse).emit('finish');

    expect(req.log.warn).toHaveBeenCalledWith(
      {
        method: 'GET',
        path: '/api/health',
        statusCode: 200,
        durationMs: 1250
      },
      'Request completed'
    );
    expect(req.log.info).not.toHaveBeenCalled();
  });

  it('can disable the response time header', () => {
    const req = createMockRequest();
    const res = new MockResponse() as unknown as Response;
    const middleware = createRequestTimingMiddleware({
      now: () => 0n,
      setResponseTimeHeader: false
    });

    middleware(req, res, vi.fn());
    (res as unknown as MockResponse).writeHead(204);

    expect((res as unknown as MockResponse).getHeader('X-Response-Time')).toBeUndefined();
  });
});
