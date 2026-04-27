export type RunCellOutcome = 'success' | 'failure' | 'pending' | 'indeterminate';

const SUCCESS_STATUSES = new Set(['success', 'ok', 'succeeded', 'completed']);
const FAILURE_STATUSES = new Set(['error', 'failed', 'failure', 'timeout', 'timed_out']);
const PENDING_STATUSES = new Set(['running', 'idle', 'pending']);

export function normalizeRunCellStatus(status: string | null | undefined): string | undefined {
  const normalized = status?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export function classifyRunCellOutcome(params: {
  status?: string | null | undefined;
  error?: string | null | undefined;
}): RunCellOutcome {
  if (params.error?.trim()) {
    return 'failure';
  }

  const status = normalizeRunCellStatus(params.status);
  if (!status) {
    return 'indeterminate';
  }

  if (SUCCESS_STATUSES.has(status)) {
    return 'success';
  }

  if (FAILURE_STATUSES.has(status)) {
    return 'failure';
  }

  if (PENDING_STATUSES.has(status)) {
    return 'pending';
  }

  return 'indeterminate';
}

export function isRunCellFailureOutcome(outcome: RunCellOutcome): boolean {
  return outcome === 'failure';
}
