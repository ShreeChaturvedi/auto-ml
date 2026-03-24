export type WorkflowPhase = 'preprocessing' | 'feature_engineering' | 'training' | 'onboarding';

export type WorkflowStatus =
  | 'running'
  | 'paused'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'completed'
  | 'interrupted';

export type WorkflowPendingInputKind =
  | 'approval'
  | 'clarification'
  | 'selection'
  | 'edit_review';

export interface WorkflowRunState {
  runId: string;
  threadId: string;
  projectId: string;
  phase: WorkflowPhase;
  status: WorkflowStatus;
  currentNode: string;
  revision: number;
  activeDatasetId?: string;
  activeNotebookId?: string;
  pendingInputKind?: WorkflowPendingInputKind;
  pauseReason?: string;
  lastFailureCode?: string;
  lastFailureMessage?: string;
  retryBudget: number;
  repairAttemptCount: number;
  handoffFromArtifactId?: string;
  handoffToArtifactId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowEventRecord {
  eventId: string;
  runId: string;
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowArtifactRecord {
  artifactId: string;
  runId: string;
  artifactType: string;
  label?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowApprovalRecord {
  approvalId: string;
  runId: string;
  approvalType: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  resolvedAt?: string;
  payload: Record<string, unknown>;
}

export interface WorkflowHandoffRecord {
  handoffId: string;
  projectId: string;
  fromPhase: WorkflowPhase;
  toPhase: WorkflowPhase;
  sourceArtifactId: string;
  targetArtifactId?: string;
  status: 'available' | 'consumed' | 'superseded';
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNotebookBindingRecord {
  bindingId: string;
  runId: string;
  artifactId?: string;
  stepId?: string;
  notebookId?: string;
  cellIds: string[];
  codeHash?: string;
  bindingRevision: number;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunSnapshot {
  run: WorkflowRunState;
  events: WorkflowEventRecord[];
  artifacts: WorkflowArtifactRecord[];
  approvals: WorkflowApprovalRecord[];
  handoffs: WorkflowHandoffRecord[];
  notebookBindings: WorkflowNotebookBindingRecord[];
}

export interface WorkflowTurnRequest {
  projectId: string;
  phase: WorkflowPhase;
  prompt?: string;
  runId?: string;
  threadId?: string;
  datasetId?: string;
  notebookId?: string;
  targetColumn?: string;
  featureSummary?: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  model?: string;
  // Onboarding-specific fields
  userIntent?: string;
  questionAnswers?: Array<{ questionId: string; answer: string | string[] }>;
  round?: number;
}

export interface WorkflowStateEvent {
  type: 'workflow_state';
  state: WorkflowRunState & {
    mode?: 'answer' | 'inspect' | 'action' | 'await_input' | 'summarize' | 'failed' | 'completed';
    phaseContext?: Record<string, unknown>;
  };
}

export interface WorkflowToolExecutedEvent {
  type: 'tool_executed';
  call: {
    id: string;
    tool: string;
    args?: Record<string, unknown>;
    rationale?: string;
    thoughtSignature?: string;
  };
  result: {
    id: string;
    tool: string;
    output?: unknown;
    error?: string;
  };
  state?: WorkflowStateEvent['state'];
}

export interface WorkflowArtifactUpdatedEvent {
  type: 'artifact_updated';
  artifact: {
    artifactId?: string;
    runId?: string;
    kind: 'ui' | 'plan' | 'summary';
    label?: string;
    payload?: Record<string, unknown>;
    ui?: Record<string, unknown> | null;
  };
  state?: WorkflowStateEvent['state'];
}

export interface WorkflowPauseEvent {
  type: 'workflow_pause';
  reason: string;
  pendingInputKind?: WorkflowPendingInputKind;
  message?: string;
  ui?: Record<string, unknown> | null;
  state?: WorkflowStateEvent['state'];
}

export interface WorkflowErrorEvent {
  type: 'workflow_error';
  message: string;
  retryable: boolean;
  code?: string;
  state?: WorkflowStateEvent['state'];
}
