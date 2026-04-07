import type { MutableRefObject } from 'react';

import type { LlmStreamEvent } from '@/lib/api/llm';
import type { BuildRequestOptions, DomainAdapter } from '@/types/agentic';
import type { ChatMessage, ToolCall, ToolResult, UiSchema } from '@/types/llmUi';
import type { WorkflowState } from '@/types/workflow';

interface CreateAgenticEventHandlerOptions {
  requestId: number;
  prompt: string;
  requestOptions: BuildRequestOptions;
  domainAdapter: DomainAdapter;
  activeRequestIdRef: MutableRefObject<number>;
  currentTextIdRef: MutableRefObject<string | null>;
  handleStreamEvent: (event: LlmStreamEvent) => boolean;
  completeThinking: () => void;
  closeTextStream: () => void;
  appendToken: (token: string) => void;
  appendUiSchema: (schema: UiSchema) => void;
  appendBackendToolExecution: (call: ToolCall, result: ToolResult, nextState?: WorkflowState) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setError: (message: string | null) => void;
  setIsStreaming: (value: boolean) => void;
}

function resolveArtifactMessage(event: Extract<LlmStreamEvent, { type: 'artifact_updated' }>): string | null {
  if (typeof event.artifact.message === 'string') {
    return event.artifact.message;
  }

  if (
    event.artifact.payload
    && typeof event.artifact.payload === 'object'
    && !Array.isArray(event.artifact.payload)
    && typeof (event.artifact.payload as { message?: unknown }).message === 'string'
  ) {
    return (event.artifact.payload as { message: string }).message;
  }

  return null;
}

export function createAgenticEventHandler({
  requestId,
  prompt,
  requestOptions,
  domainAdapter,
  activeRequestIdRef,
  currentTextIdRef,
  handleStreamEvent,
  completeThinking,
  closeTextStream,
  appendToken,
  appendUiSchema,
  appendBackendToolExecution,
  setMessages,
  setError,
  setIsStreaming
}: CreateAgenticEventHandlerOptions) {
  return (rawEvent: unknown) => {
    const event = rawEvent as LlmStreamEvent;
    if (requestId !== activeRequestIdRef.current) {
      return;
    }

    const handled = handleStreamEvent(event);
    if (handled) {
      if (event.type === 'error') {
        domainAdapter.onStreamError?.(event.message);
      }
      return;
    }

    if (event.type === 'workflow_state') {
      completeThinking();
      domainAdapter.onWorkflowStateUpdate?.(event.state);
      return;
    }

    if (event.type === 'tool_executed') {
      completeThinking();
      closeTextStream();
      appendBackendToolExecution(event.call, event.result, event.state);
      return;
    }

    if (event.type === 'artifact_updated') {
      completeThinking();
      if (event.state) {
        domainAdapter.onWorkflowStateUpdate?.(event.state);
      }
      domainAdapter.onWorkflowArtifactUpdate?.(event.artifact, event.state);
      const artifactMessage = resolveArtifactMessage(event);
      if (artifactMessage?.trim() && !currentTextIdRef.current) {
        appendToken(artifactMessage);
      }
      if (event.artifact.ui) {
        appendUiSchema(event.artifact.ui);
      }
      return;
    }

    if (event.type === 'workflow_pause') {
      completeThinking();
      closeTextStream();
      if (event.state) {
        domainAdapter.onWorkflowStateUpdate?.(event.state);
      }
      domainAdapter.onWorkflowPause?.(event);
      if (event.ui) {
        appendUiSchema(event.ui);
      }
      const pauseMessage = event.message?.trim()
        || (event.pendingInputKind === 'approval'
          ? 'A step requires your approval. Review the proposal above and click Accept or type your response to continue.'
          : undefined);
      if (pauseMessage && !currentTextIdRef.current) {
        appendToken(pauseMessage);
      }
      setIsStreaming(false);
      return;
    }

    if (event.type === 'workflow_error') {
      completeThinking();
      closeTextStream();
      if (event.state) {
        domainAdapter.onWorkflowStateUpdate?.(event.state);
      }
      setError(event.message);
      domainAdapter.onStreamError?.(event.message);
      setMessages((prev) => [...prev, {
        id: `workflow-error-${Date.now()}`,
        type: 'error',
        message: event.message,
        retryable: event.retryable ?? false,
        code: event.code
      }]);
      setIsStreaming(false);
      return;
    }

    if (event.type === 'usage' || event.type === 'ask_user' || event.type === 'plan_exit' || event.type === 'done') {
      return;
    }

    if (requestOptions.continuation && prompt.trim().length === 0) {
      return;
    }
  };
}
