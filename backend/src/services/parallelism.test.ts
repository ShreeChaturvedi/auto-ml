import { describe, expect, it } from 'vitest';

import { buildNJobsPythonSnippet, resolveContainerSafeNJobs } from './parallelism.js';

describe('resolveContainerSafeNJobs', () => {
  it('uses env override', () => {
    expect(resolveContainerSafeNJobs('3')).toBe(3);
    expect(resolveContainerSafeNJobs('-1')).toBe(-1);
  });
  it('falls back when unset', () => {
    expect(resolveContainerSafeNJobs(undefined, 2)).toBe(2);
  });
});

describe('buildNJobsPythonSnippet', () => {
  it('emits TUNING_N_JOBS check and cgroup read', () => {
    const snip = buildNJobsPythonSnippet('TUNING_N_JOBS', 4);
    expect(snip).toContain('TUNING_N_JOBS');
    expect(snip).toContain('/sys/fs/cgroup/cpu.max');
    expect(snip).toContain('n_jobs = max(1, min(int(_cpus), 4))');
  });
});
