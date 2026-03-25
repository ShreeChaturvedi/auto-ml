/**
 * useRetryPolicy
 *
 * Manages retry state and backoff logic for agentic loop operations.
 * Provides exponential backoff calculation and retry attempt tracking.
 */

import { useState, useCallback } from 'react';

export interface UseRetryPolicyOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
}

export interface UseRetryPolicyReturn {
  retryCount: number;
  canRetry: () => boolean;
  getBackoffDelay: () => number;
  recordRetry: () => void;
  resetRetries: () => void;
}

/**
 * Calculates exponential backoff delay with jitter.
 * Formula: initialDelay * (multiplier ^ retryCount) + jitter
 */
function calculateBackoffDelay(
  retryCount: number,
  initialDelayMs: number,
  backoffMultiplier: number
): number {
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, retryCount);
  // Add up to 20% jitter to avoid thundering herd
  const jitter = exponentialDelay * 0.2 * Math.random();
  return exponentialDelay + jitter;
}

export function useRetryPolicy({
  maxRetries = 3,
  initialDelayMs = 1000,
  backoffMultiplier = 2
}: UseRetryPolicyOptions = {}): UseRetryPolicyReturn {
  const [retryCount, setRetryCount] = useState(0);

  const canRetry = useCallback(() => {
    return retryCount < maxRetries;
  }, [retryCount, maxRetries]);

  const getBackoffDelay = useCallback(() => {
    return calculateBackoffDelay(retryCount, initialDelayMs, backoffMultiplier);
  }, [retryCount, initialDelayMs, backoffMultiplier]);

  const recordRetry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  const resetRetries = useCallback(() => {
    setRetryCount(0);
  }, []);

  return {
    retryCount,
    canRetry,
    getBackoffDelay,
    recordRetry,
    resetRetries
  };
}
