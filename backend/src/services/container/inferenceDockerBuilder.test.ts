import { describe, expect, it } from 'vitest';

import { buildInferenceDockerRunArgs } from './inferenceDockerBuilder.js';

const base = {
  containerName: 'automl-serve-abcdef12',
  imageName: 'automl-python-runtime:3.11',
  modelArtifactPath: '/tmp/model-artifacts/some-model',
  deploymentDir: '/tmp/deployments/dep-1',
};

function argString(args: string[]): string {
  return args.join(' ');
}

describe('buildInferenceDockerRunArgs', () => {
  it('uses plain python entrypoint when no runtimeDependencies are given (sklearn path, no regression)', () => {
    const args = buildInferenceDockerRunArgs({ ...base });
    expect(args).toContain('--entrypoint');
    // entrypoint is the token immediately following --entrypoint
    const entrypoint = args[args.indexOf('--entrypoint') + 1];
    expect(entrypoint).toBe('python');
    expect(args[args.length - 1]).toBe('/workspace/serve.py');
  });

  it('uses sh -c wrapper with pip install for non-empty runtimeDependencies (xgboost)', () => {
    const args = buildInferenceDockerRunArgs({
      ...base,
      runtimeDependencies: ['xgboost'],
    });
    const entrypoint = args[args.indexOf('--entrypoint') + 1];
    expect(entrypoint).toBe('sh');
    // -c flag is the argument before the bootstrap command
    const cIdx = args.indexOf('-c');
    expect(cIdx).toBeGreaterThan(0);
    const bootstrap = args[cIdx + 1] ?? '';
    expect(bootstrap).toContain('pip install');
    expect(bootstrap).toContain('--no-cache-dir');
    expect(bootstrap).toContain('--target /workspace/.python');
    expect(bootstrap).toContain('xgboost');
    expect(bootstrap).toContain('exec python /workspace/serve.py');
  });

  it('includes the pytorch CPU extra-index-url when pytorch-tabular is in the dep list', () => {
    const args = buildInferenceDockerRunArgs({
      ...base,
      runtimeDependencies: ['pytorch-tabular'],
    });
    const bootstrap = args[args.indexOf('-c') + 1] ?? '';
    expect(bootstrap).toContain('--extra-index-url');
    expect(bootstrap).toContain('https://download.pytorch.org/whl/cpu');
  });

  it('does NOT include the pytorch CPU index when only pure-python deps are requested', () => {
    const args = buildInferenceDockerRunArgs({
      ...base,
      runtimeDependencies: ['catboost', 'lightgbm'],
    });
    const bootstrap = args[args.indexOf('-c') + 1] ?? '';
    expect(bootstrap).not.toContain('--extra-index-url');
    expect(bootstrap).toContain('catboost');
    expect(bootstrap).toContain('lightgbm');
  });

  it('exports PYTHONPATH so serve.py can import packages installed into /workspace/.python', () => {
    const args = buildInferenceDockerRunArgs({
      ...base,
      runtimeDependencies: ['xgboost'],
    });
    const env = argString(args);
    expect(env).toMatch(/-e PYTHONPATH=\/workspace\/\.python/);
  });

  it('keeps the read-only + bind-mount layout regardless of runtimeDependencies', () => {
    const args = buildInferenceDockerRunArgs({
      ...base,
      runtimeDependencies: ['xgboost'],
    });
    expect(args).toContain('--read-only');
    const joined = argString(args);
    expect(joined).toMatch(/-v \/tmp\/model-artifacts\/some-model:\/model:ro/);
    expect(joined).toMatch(/-v \/tmp\/deployments\/dep-1:\/workspace:rw/);
  });
});
