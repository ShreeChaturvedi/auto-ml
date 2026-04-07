import type { Response, NextFunction } from 'express';

import type { PredictRequest } from './requireDeploymentAuth.js';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const MAX_ENTRIES = 500;

const windows = new Map<string, number[]>();

function evictOld(deploymentId: string) {
  const timestamps = windows.get(deploymentId);
  if (!timestamps) return;
  const cutoff = Date.now() - WINDOW_MS;
  // Single-pass compaction: overwrite in place
  let write = 0;
  for (let read = 0; read < timestamps.length; read++) {
    if (timestamps[read] > cutoff) {
      timestamps[write++] = timestamps[read];
    }
  }
  if (write === 0) windows.delete(deploymentId);
  else timestamps.length = write;
}

/** In-memory sliding-window rate limiter: 60 req/min per deployment. */
export function deploymentRateLimit(req: PredictRequest, res: Response, next: NextFunction): void {
  const deploymentId = req.params.deploymentId ?? req.deployment?.deploymentId;
  if (!deploymentId) return next();

  evictOld(deploymentId);

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

  const now = Date.now();

  if (timestamps.length >= MAX_REQUESTS) {
    res.status(429).json({ error: 'Rate limit exceeded. Max 60 requests per minute.' });
    return;
  }

  timestamps.push(now);
  next();
}
