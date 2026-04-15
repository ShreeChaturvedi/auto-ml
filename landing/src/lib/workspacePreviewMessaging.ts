import type { Phase } from '@frontend/types/phase';

export const WORKSPACE_PREVIEW_MESSAGE_TYPE = 'landing-workspace-preview:set-phase';
export const WORKSPACE_PREVIEW_READY_MESSAGE_TYPE = 'landing-workspace-preview:ready';

export const WORKSPACE_PREVIEW_PHASES: Phase[] = [
  'upload',
  'data-viewer',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments',
  'deployment',
];

export interface WorkspacePreviewMessage {
  type: typeof WORKSPACE_PREVIEW_MESSAGE_TYPE;
  phase: Phase;
}

export interface WorkspacePreviewReadyMessage {
  type: typeof WORKSPACE_PREVIEW_READY_MESSAGE_TYPE;
}

export function isWorkspacePreviewPhase(value: unknown): value is Phase {
  return typeof value === 'string' && WORKSPACE_PREVIEW_PHASES.includes(value as Phase);
}

export function isWorkspacePreviewMessage(value: unknown): value is WorkspacePreviewMessage {
  if (!value || typeof value !== 'object') return false;
  const maybeMessage = value as Partial<WorkspacePreviewMessage>;
  return maybeMessage.type === WORKSPACE_PREVIEW_MESSAGE_TYPE
    && isWorkspacePreviewPhase(maybeMessage.phase);
}

export function isWorkspacePreviewReadyMessage(
  value: unknown,
): value is WorkspacePreviewReadyMessage {
  if (!value || typeof value !== 'object') return false;
  return (value as Partial<WorkspacePreviewReadyMessage>).type === WORKSPACE_PREVIEW_READY_MESSAGE_TYPE;
}
