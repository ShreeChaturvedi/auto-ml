import { z } from 'zod';

import { env } from '../../config.js';
import { appLogger } from '../../logging/logger.js';
import type { LlmClient, LlmMessage } from '../llm/llmClient.js';
import type { LlmReasoningEffort } from '../llm/modelCatalog.js';

import { extractJson } from './jsonNormalization.js';
import { createModelWorkBlock } from './progressEmitter.js';
import type {
  NlModelWorkEvent,
  NlModelWorkKind,
  NlProgressPhaseId,
  NlProviderInfo
} from './types.js';

export function isTruncatedOutput(raw: string): boolean {
  const trimmed = raw.trimEnd();
  return trimmed.length > 0 && trimmed.startsWith('{') && !trimmed.endsWith('}');
}

export function isTimeoutLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    return normalized.includes('timed out')
      || normalized.includes('timeout')
      || normalized.includes('aborted')
      || normalized.includes('aborterror');
  }
  return false;
}

export function summarizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }

  const compact = error.message
    .replace(/\s+/g, ' ')
    .replace(/[{}"]/g, '')
    .trim();
  if (!compact) {
    return 'unknown error';
  }
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

export function toStructuredRequestError(label: string, error: unknown): Error {
  if (isTimeoutLikeError(error)) {
    return new Error(`${label} request timed out after ${env.nl2sqlTimeoutMs}ms.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function formatToolCallMarkdown(name: string, args: Record<string, unknown>): string {
  return [
    `**Tool:** \`${name}\``,
    '',
    '```json',
    JSON.stringify(args, null, 2),
    '```'
  ].join('\n');
}

export async function requestStructuredJson<T extends z.ZodTypeAny>(params: {
  client: LlmClient;
  systemPrompt: string;
  userPrompt: string;
  schema: T;
  label: string;
  normalize?: (value: unknown) => unknown;
  maxOutputTokens?: number;
  reasoningEffort?: LlmReasoningEffort;
  modelWork?: {
    onModelWork?: (event: NlModelWorkEvent) => void;
    phaseId: NlProgressPhaseId;
    kind: NlModelWorkKind;
    title: string;
    provider?: NlProviderInfo;
    formatResult?: (value: z.infer<T>) => string;
  };
}): Promise<z.infer<T>> {
  let lastError: Error | null = null;
  let previousRaw = '';
  const modelWork = params.modelWork;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const messages: LlmMessage[] = [
      { role: 'system' as const, content: params.systemPrompt },
      { role: 'user' as const, content: params.userPrompt }
    ];

    if (attempt === 2 && previousRaw) {
      messages.push({ role: 'assistant' as const, content: previousRaw });
      messages.push({
        role: 'user' as const,
        content: `The previous ${params.label} response was invalid. Return only raw JSON matching the required schema. Do not include markdown, prose, code fences, or backticks.`
      });
    }

    let raw = '';
    let mainBlock: ReturnType<typeof createModelWorkBlock> | null = null;
    let thinkingBlock: ReturnType<typeof createModelWorkBlock> | null = null;
    try {
      const requestPayload = {
        messages,
        temperature: attempt === 1 ? 0.1 : 0,
        maxOutputTokens: params.maxOutputTokens ?? 2048,
        responseMimeType: 'application/json' as const,
        reasoningEffort: params.reasoningEffort,
        contextId: `${params.label}-${attempt}`
      };

      if (modelWork?.onModelWork) {
        thinkingBlock = createModelWorkBlock({
          onModelWork: modelWork.onModelWork,
          phaseId: modelWork.phaseId,
          kind: 'thinking',
          title: `${modelWork.title} thinking`,
          provider: modelWork.provider
        });

        raw = await params.client.stream(requestPayload, {
          onToken: () => {},
          onThinking: (text) => {
            thinkingBlock?.delta(text);
          },
          onToolCall: (call) => {
            const toolBlock = createModelWorkBlock({
              onModelWork: modelWork.onModelWork,
              phaseId: modelWork.phaseId,
              kind: 'tool',
              title: `Tool call: ${call.name}`,
              provider: modelWork.provider
            });
            toolBlock.delta(formatToolCallMarkdown(call.name, call.args), {
              thoughtSignature: call.thoughtSignature
            });
            toolBlock.complete();
          }
        });

        thinkingBlock.complete();
      } else {
        raw = await params.client.complete(requestPayload);
      }
    } catch (error) {
      if (thinkingBlock) {
        thinkingBlock.complete({
          error: summarizeError(error)
        }, 'failed');
      }
      lastError = toStructuredRequestError(params.label, error);
      // Provider/network failures should fail fast into higher-level fallback logic.
      break;
    }

    previousRaw = raw;

    try {
      const parsedJson = extractJson(raw);
      const normalizedJson = params.normalize ? params.normalize(parsedJson) : parsedJson;
      const validated = params.schema.safeParse(normalizedJson);
      if (validated.success) {
        if (modelWork?.onModelWork) {
          mainBlock = createModelWorkBlock({
            onModelWork: modelWork.onModelWork,
            phaseId: modelWork.phaseId,
            kind: modelWork.kind,
            title: modelWork.title,
            provider: modelWork.provider
          });
          const content = modelWork.formatResult
            ? modelWork.formatResult(validated.data)
            : JSON.stringify(validated.data, null, 2);
          mainBlock.delta(content, { attempt });
          mainBlock.complete({ attempt });
        }
        return validated.data;
      }
      lastError = new Error(
        `${params.label} validation failed: ${validated.error.issues.map((issue) => issue.message).join('; ')}`
      );
    } catch (error) {
      lastError = toStructuredRequestError(params.label, error);
      if (isTimeoutLikeError(lastError) || isTruncatedOutput(previousRaw)) {
        break;
      }
    }

    appLogger.warn(`[nlToSqlV2] ${params.label} attempt ${attempt} returned invalid structured output: ${summarizeError(lastError)}`);
  }

  throw lastError ?? new Error(`Failed to produce valid ${params.label} JSON.`);
}
