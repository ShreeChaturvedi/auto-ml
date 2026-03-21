import type { RequestHandler, Response } from 'express';

export const DEFAULT_SLOW_REQUEST_THRESHOLD_MS = 1000;

type RequestTimingOptions = {
  now?: () => bigint;
  slowRequestThresholdMs?: number;
  setResponseTimeHeader?: boolean;
};

function formatDurationMs(durationMs: number): number {
  return Math.round(durationMs * 10) / 10;
}

function setResponseTimeHeader(res: Response, durationMs: number) {
  if (res.headersSent) {
    return;
  }

  res.setHeader('X-Response-Time', `${formatDurationMs(durationMs)}ms`);
}

export function createRequestTimingMiddleware(options: RequestTimingOptions = {}): RequestHandler {
  const now = options.now ?? (() => process.hrtime.bigint());
  const slowRequestThresholdMs = options.slowRequestThresholdMs ?? DEFAULT_SLOW_REQUEST_THRESHOLD_MS;
  const shouldSetResponseTimeHeader = options.setResponseTimeHeader ?? true;

  return (req, res, next) => {
    const start = now();
    let responseHeaderWritten = false;

    if (shouldSetResponseTimeHeader) {
      const originalWriteHead = res.writeHead.bind(res);
      res.writeHead = ((...args: Parameters<Response['writeHead']>) => {
        if (!responseHeaderWritten) {
          const durationMs = Number(now() - start) / 1_000_000;
          setResponseTimeHeader(res, durationMs);
          responseHeaderWritten = true;
        }

        return originalWriteHead(...args);
      }) as Response['writeHead'];
    }

    res.once('finish', () => {
      const durationMs = Number(now() - start) / 1_000_000;
      const level = durationMs >= slowRequestThresholdMs ? 'warn' : 'info';

      req.log[level](
        {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: formatDurationMs(durationMs)
        },
        'Request completed'
      );
    });

    next();
  };
}

export const requestTimingMiddleware = createRequestTimingMiddleware();
