// ---------------------------------------------------------------------------
// Shared types used across all phase implementations.
// ---------------------------------------------------------------------------

import type { PhaseType } from '../phaseConfig.js';

export type { PhaseType };

export interface PhaseRunState<TStep = unknown> {
  runId: string;
  phase: PhaseType;
  currentStage: string;
  steps: Record<string, TStep>;
  metadata?: Record<string, unknown>;
}

export interface WorkflowConfigurable {
  sink: import('../eventSink.js').WorkflowEventSink;
  phaseConfig: import('../phaseConfig.js').PhaseConfig;
  llmClient?: import('../../llm/llmClient.js').LlmClient;
}

export interface GraphRunnableConfig {
  configurable: WorkflowConfigurable;
  [key: string]: unknown;
}
