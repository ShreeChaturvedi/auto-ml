/**
 * useChatStream - Encapsulates the LLM stream execution loop for chat.
 *
 * Extracted from ChatPanel to isolate:
 * - The recursive `runStream` callback that drives streaming + tool execution
 * - The `handleSend` / `handleStop` callbacks
 * - Abort controller management
 */

import { useCallback, useRef } from 'react';
import { streamTrainingPlan, executeToolCalls, type LlmStreamEvent } from '@/lib/api/llm';
import type { ChatMessage, ToolCall, ToolResult } from '@/types/llmUi';
import type { ResolvedMention } from '@/hooks/useMentionAutocomplete';
import type { MentionInputHandle } from '@/components/llm/MentionInput';
import type { ReasoningEffort } from '@/components/llm/modelOptions';

interface UseChatStreamOptions {
  projectId: string;
  assistantModel: string;
  reasoningEffort: ReasoningEffort;
  chatInput: string;
  isGenerating: boolean;
  resolvedMentions: ResolvedMention[];
  setChatInput: (value: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  appendToken: (token: string) => void;
  closeTextStream: () => void;
  completeThinking: () => void;
  handleStreamEvent: (event: LlmStreamEvent) => boolean;
  markToolsCompleteFallback: (toolCalls: ToolCall[]) => void;
  applyToolResults: (results: ToolResult[]) => void;
  mentionDismiss: () => void;
  mentionInputRef: React.RefObject<MentionInputHandle | null>;
}

export function useChatStream({
  projectId,
  assistantModel,
  reasoningEffort,
  chatInput,
  isGenerating,
  resolvedMentions,
  setChatInput,
  setMessages,
  setIsGenerating,
  appendToken,
  closeTextStream,
  completeThinking,
  handleStreamEvent,
  markToolsCompleteFallback,
  applyToolResults,
  mentionDismiss,
  mentionInputRef
}: UseChatStreamOptions) {
  const abortRef = useRef<AbortController | null>(null);

  const runStream = useCallback(
    async (
      request: {
        prompt?: string;
        toolCalls?: ToolCall[];
        toolResults?: ToolResult[];
      },
      controller: AbortController
    ) => {
      await streamTrainingPlan(
        {
          projectId,
          prompt: request.prompt,
          toolCalls: request.toolCalls,
          toolResults: request.toolResults,
          model: assistantModel,
          reasoningEffort
        },
        async (event: LlmStreamEvent) => {
          // Let the shared hook handle token, thinking, usage, error, done
          if (handleStreamEvent(event)) return;

          // Handle envelope events (tool calls + fallback message)
          if (event.type === 'envelope') {
            if (event.envelope.tool_calls?.length) {
              closeTextStream();
              const toolCalls = event.envelope.tool_calls;
              for (const call of toolCalls) {
                setMessages((prev) => [...prev, { id: `tool-${call.id}`, type: 'tool_call', call }]);
              }

              try {
                const { results } = await executeToolCalls(projectId, toolCalls);
                applyToolResults(results);
                if (!controller.signal.aborted) {
                  await runStream({ toolCalls, toolResults: results }, controller);
                }
              } catch (toolError) {
                console.error('[ChatPanel] Tool execution failed:', toolError);
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.type === 'tool_call' && toolCalls.some((tc) => tc.id === msg.call.id)) {
                      return {
                        ...msg,
                        result: {
                          id: msg.call.id,
                          tool: msg.call.tool,
                          error: toolError instanceof Error ? toolError.message : 'Tool execution failed'
                        }
                      };
                    }
                    return msg;
                  })
                );
              } finally {
                markToolsCompleteFallback(toolCalls);
              }
              return;
            }

            if (event.envelope.message?.trim()) {
              appendToken(event.envelope.message);
            }
          }
        },
        controller.signal
      );
    },
    [
      appendToken,
      applyToolResults,
      closeTextStream,
      handleStreamEvent,
      markToolsCompleteFallback,
      assistantModel,
      projectId,
      reasoningEffort,
      setMessages
    ]
  );

  const handleSend = useCallback(async () => {
    if (!chatInput.trim() || isGenerating) return;

    const userMessage = chatInput.trim();
    const currentMentions = resolvedMentions;

    setChatInput('');
    mentionDismiss();
    setIsGenerating(true);

    const userChatMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: userMessage,
      mentions: currentMentions.length > 0 ? currentMentions : undefined,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, userChatMessage]);

    // Append referenced files context to prompt for the LLM
    let prompt = userMessage;
    if (currentMentions.length > 0) {
      const fileList = currentMentions.map((m) => m.name).join(', ');
      prompt += `\n\n[Referenced files: ${fileList}]`;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await runStream({ prompt }, controller);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to generate response'
        }
      ]);
      setIsGenerating(false);
    } finally {
      mentionInputRef.current?.focus();
    }
  }, [chatInput, isGenerating, resolvedMentions, mentionDismiss, setIsGenerating, setMessages, runStream, setChatInput, mentionInputRef]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    completeThinking();
    closeTextStream();
    setIsGenerating(false);
  }, [closeTextStream, completeThinking, setIsGenerating]);

  return { handleSend, handleStop };
}
