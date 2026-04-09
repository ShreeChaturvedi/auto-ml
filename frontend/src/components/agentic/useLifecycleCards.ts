/**
 * useLifecycleCards - Maps tool_call messages to lifecycle card components.
 *
 * Cross-references the tool name in each message against known lifecycle tools
 * and returns a render function: (message: ChatMessage) => ReactNode | null.
 *
 * Mapping:
 *   propose_xxx            -> StepProposalCard
 *   materialize_xxx, generate_code -> CodeGenerationCard
 *   execute_xxx, run_cell  -> ExecutionCard
 *   validate_xxx           -> ValidationCard
 *   commit_xxx, register_xxx -> CommitBadge
 */

import { useCallback } from 'react';
import { createElement, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { ChatMessage, ToolCall, ToolResult } from '@/types/llmUi';
import { StepProposalCard } from './cards/StepProposalCard';
import { CodeGenerationCard } from './cards/CodeGenerationCard';
import { ExecutionCard } from './cards/ExecutionCard';
import { ValidationCard } from './cards/ValidationCard';
import { CommitBadge } from './cards/CommitBadge';
import { ErrorCard } from './cards/ErrorCard';
import { ModelSavedCard } from './cards/ModelSavedCard';

type CardType = 'proposal' | 'code' | 'execution' | 'validation' | 'commit' | 'model_saved' | 'error';

/** Determine which card type (if any) a tool name maps to. */
function classifyTool(toolName: string): CardType | null {
  // Proposal tools
  if (
    toolName === 'propose_transformation_step' ||
    toolName === 'propose_training_plan' ||
    toolName.startsWith('propose_')
  ) {
    return 'proposal';
  }

  // Code generation / writing tools
  if (
    toolName === 'write_cell' ||
    toolName === 'edit_cell' ||
    toolName === 'materialize_step_code' ||
    toolName === 'generate_code' ||
    toolName.startsWith('materialize_')
  ) {
    return 'code';
  }

  // Execution tools
  if (
    toolName === 'execute_transformation_step' ||
    toolName === 'execute_training' ||
    toolName === 'run_cell' ||
    toolName.startsWith('execute_')
  ) {
    return 'execution';
  }

  // Validation tools
  if (
    toolName === 'validate_step_result' ||
    toolName === 'evaluate_results' ||
    toolName.startsWith('validate_')
  ) {
    return 'validation';
  }

  // register_model gets its own card (ModelSavedCard) so the Training
  // chat can surface a deep link into the Experiments ModelDetailPanel
  // as soon as the model is persisted.
  if (toolName === 'register_model') {
    return 'model_saved';
  }

  // Commit / register tools
  if (
    toolName === 'commit_transformation_step' ||
    toolName === 'register_derived_dataset' ||
    toolName.startsWith('commit_') ||
    toolName.startsWith('register_')
  ) {
    return 'commit';
  }

  if (toolName === 'configure_experiment') return 'proposal';
  if (toolName === 'compare_models') return 'validation';
  if (toolName === 'checkpoint_feature_pipeline') return 'commit';

  return null;
}

/** Extract a human-readable title from a tool call's args or result. */
function extractTitle(call: ToolCall, result?: ToolResult | null): string {
  const args = call.args ?? {};
  if (typeof args.title === 'string') return args.title;
  if (typeof args.name === 'string') return args.name;
  if (typeof args.experimentName === 'string') return args.experimentName as string;
  if (typeof args.modelName === 'string') return args.modelName as string;
  if (typeof args.modelType === 'string') return (args.modelType as string).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (typeof args.step_name === 'string') return args.step_name as string;
  if (typeof args.description === 'string') return args.description as string;
  // Check result output for experiment/model name
  if (result?.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
    const out = result.output as Record<string, unknown>;
    if (typeof out.experimentName === 'string') return out.experimentName;
    if (typeof out.modelName === 'string') return out.modelName;
  }
  // Fallback: humanize the tool name
  return call.tool.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Detect phase from tool name for accent colors. */
function detectPhase(toolName: string): string {
  if (toolName.includes('training') || toolName.includes('model') || toolName === 'evaluate_results') {
    return 'training';
  }
  if (toolName.includes('feature')) {
    return 'feature_engineering';
  }
  return 'preprocessing';
}

/**
 * Hook that returns a render function mapping ChatMessages to lifecycle card ReactNodes.
 *
 * Usage:
 * ```ts
 * const renderLifecycleCard = useLifecycleCards();
 * <ChatMessageRenderer messages={messages} renderLifecycleCard={renderLifecycleCard} />
 * ```
 */
interface UseLifecycleCardsOptions {
  onProposalToggle?: (stepId: string, title: string, selected: boolean) => void;
}

export function useLifecycleCards(options?: UseLifecycleCardsOptions): (message: ChatMessage) => ReactNode | null {
  const { projectId } = useParams<{ projectId: string }>();
  const onProposalToggle = options?.onProposalToggle;

  return useCallback((message: ChatMessage): ReactNode | null => {
    if (message.type !== 'tool_call') return null;

    const { call, result } = message;
    const cardType = classifyTool(call.tool);
    if (!cardType) return null;

    const title = extractTitle(call, result);
    const hasError = !!result?.error;

    // If the tool errored, show an ErrorCard instead
    if (hasError && result?.error) {
      return createElement(ErrorCard, {
        key: message.id,
        message: result.error,
        severity: 'error',
        traceback: typeof result.output === 'string' ? result.output : undefined,
      });
    }

    switch (cardType) {
      case 'proposal': {
        const outputStatus = (result?.output && typeof result.output === 'object' && !Array.isArray(result.output))
          ? (result.output as Record<string, unknown>).status
          : undefined;
        const proposalStatus: 'pending' | 'proposed' | 'accepted' = !result
          ? 'pending'
          : outputStatus === 'awaiting_approval'
            ? 'pending'
            : outputStatus === 'proposed'
              ? 'proposed'
              : 'accepted';
        return createElement(StepProposalCard, {
          key: message.id,
          stepId: call.id,
          title,
          rationale: call.rationale,
          phase: detectPhase(call.tool),
          status: proposalStatus,
          onToggleSelect: onProposalToggle
            ? (selected: boolean) => onProposalToggle(call.id, title, selected)
            : undefined,
        });
      }

      case 'code': {
        // write_cell passes code in args.content; materialize_step_code
        // returns code in result.output; generate_code uses args.code.
        const code =
          (typeof call.args?.content === 'string' ? (call.args.content as string) : null) ??
          (typeof result?.output === 'string' ? result.output : null) ??
          (typeof call.args?.code === 'string' ? (call.args.code as string) : '') ??
          '';
        const language =
          typeof call.args?.language === 'string'
            ? (call.args.language as string)
            : 'python';
        return createElement(CodeGenerationCard, {
          key: message.id,
          code,
          language,
          expanded: false,
        });
      }

      case 'execution': {
        const isRunning = !result;
        const failed = !!result?.error;
        const output = result?.output;
        let stdout: string | undefined;
        let stderr: string | undefined;
        let duration: number | undefined;
        let failedByOutput = false;

        if (output && typeof output === 'object') {
          const out = output as Record<string, unknown>;
          const outputStatus = typeof out.status === 'string' ? out.status.toLowerCase() : undefined;
          if (outputStatus && outputStatus !== 'success' && outputStatus !== 'training') {
            failedByOutput = true;
          }
          if (out.succeeded === false) {
            failedByOutput = true;
          }
          stdout = typeof out.stdout === 'string' ? out.stdout : undefined;
          stderr = typeof out.stderr === 'string'
            ? out.stderr
            : typeof out.errorMessage === 'string'
              ? out.errorMessage
              : undefined;
          duration = typeof out.duration === 'number'
            ? out.duration
            : typeof out.executionMs === 'number'
              ? out.executionMs
              : typeof out.trainingDurationMs === 'number'
                ? out.trainingDurationMs
                : undefined;
        } else if (typeof output === 'string') {
          stdout = output;
        }

        return createElement(ExecutionCard, {
          key: message.id,
          status: isRunning ? 'running' : (failed || failedByOutput) ? 'failed' : 'success',
          stdout,
          stderr,
          duration,
        });
      }

      case 'validation': {
        const output = result?.output;
        let passed = true;
        let metrics: Array<{ name: string; before?: number; after?: number }> | undefined;
        let notes: string | undefined;

        if (output && typeof output === 'object') {
          const out = output as Record<string, unknown>;
          passed = out.passed !== false;
          if (Array.isArray(out.metrics)) {
            metrics = out.metrics as Array<{ name: string; before?: number; after?: number }>;
          }
          if (typeof out.notes === 'string') {
            notes = out.notes;
          }
        }

        return createElement(ValidationCard, {
          key: message.id,
          passed,
          metrics,
          notes,
        });
      }

      case 'commit':
        return createElement(CommitBadge, {
          key: message.id,
          title,
          details: call.rationale,
        });

      case 'model_saved': {
        // Tool hasn't returned yet — show an ephemeral commit-style badge
        // until the result arrives with modelId and metrics.
        if (!result || !result.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
          return createElement(CommitBadge, {
            key: message.id,
            title: title || 'Registering model...',
            details: call.rationale,
          });
        }
        const output = result.output as Record<string, unknown>;
        const modelId = typeof output.modelId === 'string' ? output.modelId : undefined;
        const modelName = typeof output.modelName === 'string'
          ? output.modelName
          : typeof call.args?.modelName === 'string'
            ? (call.args.modelName as string)
            : 'Untitled Model';
        const modelType = typeof output.modelType === 'string' ? output.modelType : 'unknown';
        const taskType = typeof output.taskType === 'string' ? output.taskType : 'classification';
        const metrics = (output.metrics && typeof output.metrics === 'object' && !Array.isArray(output.metrics))
          ? (output.metrics as Record<string, number>)
          : undefined;
        const artifactSize = typeof output.artifactSize === 'number' ? output.artifactSize : undefined;
        return createElement(ModelSavedCard, {
          key: message.id,
          projectId: projectId ?? '',
          modelId,
          modelName,
          modelType,
          taskType,
          metrics,
          artifactSize,
        });
      }

      default:
        return null;
    }
  }, [onProposalToggle, projectId]);
}
