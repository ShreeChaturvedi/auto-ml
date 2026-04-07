import type { Response, NextFunction } from 'express';

import type { PredictRequest } from './requireDeploymentAuth.js';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const MAX_ENTRIES = 500;

const windows = new Map<string, number[]>();

/** In-memory sliding-window rate limiter: 60 req/min per deployment. */
export function deploymentRateLimit(req: PredictRequest, res: Response, next: NextFunction): void {
  const deploymentId = req.params.deploymentId ?? req.deployment?.deploymentId;
  if (!deploymentId) return next();

  // Cap total tracked deployments to bound memory
  if (windows.size > MAX_ENTRIES) {
    const oldest = [...windows.entries()].sort((a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0));
    for (let i = 0; i < oldest.length - MAX_ENTRIES; i++) {
      windows.delete(oldest[i][0]);
    }
  }

  let timestamps = windows.get(deploymentId);
  if (!timestamps) {
    timestamps = [];
    windows.set(deploymentId, timestamps);
  }

  // Single pass: evict old entries and count recent ones
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  let writeIdx = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] > cutoff) {
      timestamps[writeIdx++] = timestamps[i];
    }
  }
  timestamps.length = writeIdx;

  if (writeIdx >= MAX_REQUESTS) {
    res.status(429).json({ error: 'Rate limit exceeded. Max 60 requests per minute.' });
    return;
  }

  timestamps.push(now);
  next();
}
