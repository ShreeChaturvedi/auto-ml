import type { z } from 'zod';

import type { LlmRequest, RawLlmUsage } from '../../../services/llm/llmClient.js';
import type { AskUserPayloadSchema, PlanExitPayloadSchema, ToolCallSchema } from '../../../types/llm.js';
import type { LlmEnvelope } from '../../../types/llm.js';

/** Supported workflow phases for LLM streaming. */
export type StreamKind = 'feature_engineering' | 'training' | 'onboarding' | 'preprocessing';

/** Lifecycle hooks injected by route handlers. */
export interface StreamHooks {
  onError?: (message: string) => Promise<void> | void;
  onAborted?: (message: string) => Promise<void> | void;
}

/** Mutable accumulator shared across all stream processing stages. */
export interface StreamContext {
  readonly kind: StreamKind;
  readonly requestId: string;
  readonly suppressTokenStreaming: boolean;

  toolCalls: z.infer<typeof ToolCallSchema>[];
  askUserPayload: z.infer<typeof AskUserPayloadSchema> | null;
  planExitPayload: z.infer<typeof PlanExitPayloadSchema> | null;
  terminalToolConflict: boolean;
  uiEnvelope: LlmEnvelope | null;
  tokenChars: number;
  tokenPreview: string;
  streamClosed: boolean;
  latestUsage: RawLlmUsage | null;
}

/** Thin writer abstraction so handlers don't depend on Express directly. */
export interface EventWriter {
  writeEvent: (payload: Record<string, unknown>) => void;
  closeStream: () => void;
}

export type { LlmRequest };
