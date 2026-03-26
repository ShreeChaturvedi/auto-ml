import { describe, expect, it } from 'vitest';

import { validateEvaluationForErrorAnalysis } from '../evaluationStatusValidator.js';

describe('validateEvaluationForErrorAnalysis', () => {
  it('blocks "pending" status', () => {
    const result = validateEvaluationForErrorAnalysis('pending');
    expect(result).toBeDefined();
    expect(result).toContain('in progress');
  });

  it('blocks "computing" status', () => {
    const result = validateEvaluationForErrorAnalysis('computing');
    expect(result).toBeDefined();
    expect(result).toContain('in progress');
  });

  it('blocks "failed" status', () => {
    const result = validateEvaluationForErrorAnalysis('failed');
    expect(result).toBeDefined();
    expect(result).toContain('failed');
  });

  it('allows "completed" status', () => {
    expect(validateEvaluationForErrorAnalysis('completed')).toBeUndefined();
  });

  it('allows "ready" status', () => {
    expect(validateEvaluationForErrorAnalysis('ready')).toBeUndefined();
  });

  it('allows undefined status (no evaluation yet — let caller decide)', () => {
    expect(validateEvaluationForErrorAnalysis(undefined)).toBeUndefined();
  });

  it('allows unknown/arbitrary status strings', () => {
    expect(validateEvaluationForErrorAnalysis('some_random_status')).toBeUndefined();
  });

  it('returns string error messages (not boolean)', () => {
    const result = validateEvaluationForErrorAnalysis('pending');
    expect(typeof result).toBe('string');
  });
});
