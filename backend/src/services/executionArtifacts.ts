/**
 * Shared helpers for handling execution artifacts produced inside the container.
 *
 * These helpers are intentionally defensive: a bad artifact path must never cause
 * destructive filesystem operations (e.g. `rm -r` on the entire workspace).
 */

import { isAbsolute, relative, resolve } from 'node:path';

export const CONTAINER_WORKSPACE_ROOT = '/workspace';

export const AUTOML_ARTIFACT_ROOT = `${CONTAINER_WORKSPACE_ROOT}/.automl_artifacts`;
export const AUTOML_ARTIFACT_PREFIX = `${AUTOML_ARTIFACT_ROOT}/`;

function normalizeContainerPath(containerPath: string): string {
  // Docker/container paths should be absolute. Normalize multiple leading slashes
  // so checks like `startsWith("/workspace/")` work reliably.
  return containerPath.replace(/^\/+/, '/');
}

export function isAutomlArtifactPath(containerPath: string): boolean {
  return normalizeContainerPath(containerPath).startsWith(AUTOML_ARTIFACT_PREFIX);
}

export function containerWorkspaceRelativePath(containerPath: string): string {
  const normalized = normalizeContainerPath(containerPath);
  const workspacePrefix = `${CONTAINER_WORKSPACE_ROOT}/`;
  if (normalized.startsWith(workspacePrefix)) {
    return normalized.slice(workspacePrefix.length);
  }
  // Best-effort fallback: strip leading slashes.
  return normalized.replace(/^\/+/, '');
}

/**
 * Given a workspace-relative artifact path, return the execution directory relative path:
 *   ".automl_artifacts/<uuid>"
 *
 * Returns null if the path is not recognized as an AutoML artifact path.
 */
export function artifactExecDirRel(workspaceRelativePath: string): string | null {
  const match = /^\.automl_artifacts\/([^/]+)(?:\/|$)/.exec(workspaceRelativePath);
  if (!match) {
    return null;
  }
  return `.automl_artifacts/${match[1]}`;
}

/**
 * Resolve a workspace-relative path to a host filesystem path, ensuring it stays within
 * the workspace root. Returns null when the resolved path would escape the workspace.
 */
export function resolveHostPathInWorkspace(
  workspaceRoot: string,
  workspaceRelativePath: string
): string | null {
  const workspaceAbs = resolve(workspaceRoot);
  const candidate = resolve(workspaceAbs, workspaceRelativePath);
  const rel = relative(workspaceAbs, candidate);

  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return candidate;
}
