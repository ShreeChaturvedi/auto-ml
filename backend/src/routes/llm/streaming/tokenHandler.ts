import type { LlmClient, LlmStreamHandlers } from '../../../services/llm/llmClient.js';

import { dispatchToolCall } from './toolCallHandler.js';
import type { EventWriter, LlmRequest, StreamContext } from './types.js';

/**
 * Runs a single LLM streaming attempt, wiring token / thinking / usage / tool-call
 * events into the shared {@link StreamContext}.
 */
export async function collectLlmAttempt(
  client: LlmClient,
  attemptRequest: LlmRequest,
  ctx: StreamContext,
  writer: EventWriter
): Promise<void> {
  const handlers: LlmStreamHandlers = {
    onToken: (token) => {
      ctx.tokenChars += token.length;
      if (ctx.tokenPreview.length < 600) {
        ctx.tokenPreview = `${ctx.tokenPreview}${token}`.slice(0, 600);
      }
      if (!ctx.suppressTokenStreaming) {
        writer.writeEvent({ type: 'token', text: token });
      }
    },
    onThinking: (text) => {
      ctx.thinkingChars += text.length;
      writer.writeEvent({ type: 'thinking', text });
    },
    onUsage: (usage) => {
      ctx.latestUsage = usage;
    },
    onToolCall: (call) => {
      dispatchToolCall(call, ctx, writer);
    }
  };

  await client.stream(attemptRequest, handlers);
}
