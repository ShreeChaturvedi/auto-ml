import { describe, expect, it } from 'vitest';

import type { WorkflowRunState } from '../../workflows/types.js';

import { isWorkflowThreadReference, resolveExperiment } from './types.js';

const LIVE_BUG_THREAD_ID = 'thread-9adbfc59-9ef3-48ff-9201-9dc4e3f30ec9';

function buildRun(experiments: Record<string, Record<string, unknown>>): WorkflowRunState {
  return {
    runId: 'run-1',
    threadId: LIVE_BUG_THREAD_ID,
    projectId: 'project-1',
    phase: 'training',
    status: 'running',
    currentNode: 'propose_model',
    revision: 1,
    retryBudget: 3,
    repairAttemptCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { experiments }
  };
}

function makeExperiment(id: string, name: string): Record<string, unknown> {
  return {
    experimentId: id,
    experimentName: name,
    modelType: 'elastic_net',
    status: 'configured',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

describe('isWorkflowThreadReference', () => {
  it('returns true for the live-bug thread id format', () => {
    expect(isWorkflowThreadReference(LIVE_BUG_THREAD_ID)).toBe(true);
  });

  it('returns true for prefixed variants used by preprocessing', () => {
    expect(isWorkflowThreadReference('prep-thread:abc')).toBe(true);
    expect(isWorkflowThreadReference('feature-thread-123')).toBe(true);
  });

  it('returns false for experiment ids', () => {
    expect(isWorkflowThreadReference('exp-a14496b1-062a-4780-9262-fc607cf0eaf3')).toBe(false);
  });

  it('returns false for empty or nullish input', () => {
    expect(isWorkflowThreadReference(undefined)).toBe(false);
    expect(isWorkflowThreadReference(null)).toBe(false);
    expect(isWorkflowThreadReference('')).toBe(false);
    expect(isWorkflowThreadReference('   ')).toBe(false);
  });

  it('returns false for arbitrary strings that merely contain "thread" as a loose substring', () => {
    expect(isWorkflowThreadReference('my thread is here')).toBe(false);
  });

  it('intentionally matches prefixed "thread-" patterns (false-positive acceptable)', () => {
    // The regex /^(?:[a-z]+-)*thread[-:]/i is a heuristic — any word-prefix
    // chain ending in "thread-" matches. This is DELIBERATELY broad so that
    // preprocessing-style ids like "prep-thread:..." and "feature-thread-..."
    // are caught. The false-positive risk is acceptable because no legitimate
    // experimentId (exp-<uuid>) will ever have "thread" as its second word.
    expect(isWorkflowThreadReference('exp-thread-looking-value')).toBe(true);
  });
});

describe('resolveExperiment', () => {
  it('returns the experiment for an exact id match', () => {
    const experiments = { 'exp-1': makeExperiment('exp-1', 'Baseline') };
    const result = resolveExperiment(buildRun(experiments), { experimentId: 'exp-1' });

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.experiment.experimentId).toBe('exp-1');
  });

  it('still errors when experimentId is missing entirely (preserves handler contract)', () => {
    // Mirrors the existing executionTools.test.ts "returns error for missing
    // experimentId" assertion. The lenient fallback must NOT trigger here —
    // missing id means the caller forgot, not that the planner leaked a
    // threadId, so we don't silently reach for "the most recent experiment".
    const experiments = { 'exp-1': makeExperiment('exp-1', 'Baseline') };
    const result = resolveExperiment(buildRun(experiments), {});

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toBe('This operation requires experimentId.');
  });

  it('still errors for a non-thread-shaped unknown id (never silently clobbers the wrong experiment)', () => {
    const experiments = {
      'exp-1': makeExperiment('exp-1', 'Baseline'),
      'exp-2': makeExperiment('exp-2', 'Tuned')
    };
    const result = resolveExperiment(buildRun(experiments), { experimentId: 'exp-typo' });

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('exp-typo');
    expect(result.error).toContain('Call configure_experiment first');
  });

  describe('lenient threadId-leak recovery', () => {
    it('auto-resolves a thread-shaped experimentId when exactly one experiment is configured', () => {
      // This is the live sprint10 Training bug shape: planner leaked the
      // workflow threadId as experimentId. Only one experiment exists, so
      // the intent is unambiguous — recover instead of failing.
      const experiments = { 'exp-a14496b1-062a-4780-9262-fc607cf0eaf3': makeExperiment(
        'exp-a14496b1-062a-4780-9262-fc607cf0eaf3',
        'usage_log1p_regularization_tuning'
      ) };
      const result = resolveExperiment(buildRun(experiments), { experimentId: LIVE_BUG_THREAD_ID });

      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.experiment.experimentId).toBe('exp-a14496b1-062a-4780-9262-fc607cf0eaf3');
      expect(result.experiment.experimentName).toBe('usage_log1p_regularization_tuning');
    });

    it('errors with a message naming the leak when multiple experiments exist', () => {
      // Ambiguity rule: never silently pick one when the caller's intent is
      // unclear. The error message must name the leak so the next debug
      // cycle is trivial.
      const experiments = {
        'exp-1': makeExperiment('exp-1', 'Baseline'),
        'exp-2': makeExperiment('exp-2', 'Tuned')
      };
      const result = resolveExperiment(buildRun(experiments), { experimentId: LIVE_BUG_THREAD_ID });

      expect('error' in result).toBe(true);
      if (!('error' in result)) return;
      expect(result.error).toContain('workflow thread id');
      expect(result.error).toContain('planner likely leaked');
      expect(result.error).toContain('exp-1');
      expect(result.error).toContain('exp-2');
    });

    it('errors with a "call configure_experiment first" message when no experiments exist', () => {
      const result = resolveExperiment(buildRun({}), { experimentId: LIVE_BUG_THREAD_ID });

      expect('error' in result).toBe(true);
      if (!('error' in result)) return;
      expect(result.error).toContain('workflow thread id');
      expect(result.error).toContain('Call configure_experiment first');
    });

    it('recovers for preprocessing-style thread prefixes (prep-thread:)', () => {
      // Defense in depth: the regex also matches the preprocessing-style
      // thread prefix, so if any future planner path leaks a prep-thread
      // id into training tool args, the lenient resolver still self-heals
      // against the one configured experiment.
      const experiments = { 'exp-1': makeExperiment('exp-1', 'Baseline') };
      const result = resolveExperiment(buildRun(experiments), { experimentId: 'prep-thread:some-uuid' });

      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.experiment.experimentId).toBe('exp-1');
    });
  });
});
