/**
 * Container-safe worker counts for sklearn / joblib.
 *
 * Blind `n_jobs=-1` spawns one worker per visible host CPU, which oversubscribes
 * cgroup-limited Docker containers and can hang CV. Prefer an explicit env
 * override, then cgroup-aware detection capped to a small default.
 */

export function resolveContainerSafeNJobs(envValue?: string | undefined, fallback = 2): number {
  if (envValue != null && envValue.trim() !== '') {
    const n = Number.parseInt(envValue, 10);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return fallback;
}

/**
 * Python snippet assigned to `n_jobs` inside generated tuning/training scripts.
 * Default: min(detected_cpus, cap), never unbounded -1 unless ENV=-1.
 */
export function buildNJobsPythonSnippet(envVarName = 'TUNING_N_JOBS', defaultCap = 4): string {
  return [
    'import os as _os',
    `_env_jobs = _os.environ.get(${JSON.stringify(envVarName)})`,
    'if _env_jobs is not None and str(_env_jobs).strip() != "":',
    '    n_jobs = int(_env_jobs)',
    'else:',
    '    _cpus = _os.cpu_count() or 1',
    '    try:',
    '        with open("/sys/fs/cgroup/cpu.max") as _f:',
    '            _quota, _period = _f.read().strip().split()',
    '            if _quota != "max":',
    '                _cpus = max(1, int(int(_quota) / int(_period)))',
    '    except Exception:',
    '        pass',
    `    n_jobs = max(1, min(int(_cpus), ${defaultCap}))`,
  ].join('\n');
}
