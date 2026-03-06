import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  artifactExecDirRel,
  containerWorkspaceRelativePath,
  isAutomlArtifactPath,
  resolveHostPathInWorkspace
} from './executionArtifacts.js';

describe('executionArtifacts', () => {
  it('detects AutoML artifact paths', () => {
    expect(isAutomlArtifactPath('/workspace/.automl_artifacts/abc/file.png')).toBe(true);
    expect(isAutomlArtifactPath('/workspace/other/file.png')).toBe(false);
  });

  it('computes workspace-relative paths', () => {
    expect(containerWorkspaceRelativePath('/workspace/foo/bar.txt')).toBe('foo/bar.txt');
    expect(containerWorkspaceRelativePath('///workspace/foo')).toBe('foo');
  });

  it('computes artifact exec dir rel', () => {
    expect(artifactExecDirRel('.automl_artifacts/uuid/file.png')).toBe('.automl_artifacts/uuid');
    expect(artifactExecDirRel('.automl_artifacts/uuid')).toBe('.automl_artifacts/uuid');
    expect(artifactExecDirRel('not-artifact/uuid/file.png')).toBe(null);
  });

  it('resolves host paths safely within the workspace', () => {
    const workspaceRoot = resolve('tmp', 'workspace');
    expect(resolveHostPathInWorkspace(workspaceRoot, 'foo/bar.txt')).toBe(resolve(workspaceRoot, 'foo/bar.txt'));
    expect(resolveHostPathInWorkspace(workspaceRoot, '../outside.txt')).toBe(null);
  });
});
