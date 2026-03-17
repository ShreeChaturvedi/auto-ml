/**
 * NlWorkflowSteps - Workflow step display for NL query generation
 *
 * Renders the connector lines, work plan panel, SQL reveal block,
 * and error display for the natural-language query workflow.
 * Extracted from NlQueryWorkflow to isolate the step visualization.
 */

import { useCallback, useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { NlFlowConnector } from './NlFlowConnector';
import { NlWorkPlanPanel } from './NlWorkPlanPanel';
import { SqlRevealBlock } from './SqlRevealBlock';
import type { ApproveThemeClasses, NlPhase } from './NlQueryWorkflow';
import type {
  NlGenerationResult,
  NlModelWorkBlockState,
  NlProviderInfo,
  NlWorkPhaseState
} from '@/types/nlQuery';

const AUTO_COLLAPSE_HEIGHT_PX = 920;

function isNlProviderInfo(value: unknown): value is NlProviderInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && typeof candidate.label === 'string'
    && typeof candidate.model === 'string';
}

export interface NlWorkflowStepsProps {
  /** Current workflow phase */
  phase: NlPhase;
  /** Generation result (null until available) */
  result: NlGenerationResult | null;
  /** Currently edited SQL (mirrors result.sql initially) */
  editedSql: string;
  /** Callback when the user edits the SQL */
  onSqlEdit: (sql: string) => void;
  /** Error message to display (when phase is 'error') */
  errorMessage: string | null;
  /** Callback to dismiss the error */
  onDismissError: () => void;
  /** Callback when the user approves the SQL */
  onApprove: () => void;
  /** Callback when the user rejects the SQL */
  onReject: () => void;
  /** Work phases for the plan panel */
  workPhases: NlWorkPhaseState[];
  /** Model work blocks for the plan panel */
  modelWorkBlocks: NlModelWorkBlockState[];
  /** Typewriter visible token count for reveal animation */
  visibleTokenCount: number;
  /** Whether the typewriter reveal is complete */
  isRevealComplete: boolean;
  /** Theme classes for the approve button */
  approveThemeClasses?: ApproveThemeClasses;
  /** Color class for the flow connector */
  connectorColorClassName?: string;
  /** Height of the parent container (for auto-collapse calculation) */
  containerHeight: number;
}

export function NlWorkflowSteps({
  phase,
  result,
  editedSql,
  onSqlEdit,
  errorMessage,
  onDismissError,
  onApprove,
  onReject,
  workPhases,
  modelWorkBlocks,
  visibleTokenCount,
  isRevealComplete,
  approveThemeClasses,
  connectorColorClassName,
  containerHeight,
}: NlWorkflowStepsProps) {
  const [manualPanelExpanded, setManualPanelExpanded] = useState<boolean | null>(null);

  useEffect(() => {
    if (phase === 'idle' || phase === 'error') {
      setManualPanelExpanded(null);
    }
  }, [phase]);

  const showConnector = phase !== 'idle' && phase !== 'error';
  const topConnectorState: 'active' | 'settled' = phase === 'submitting' ? 'active' : 'settled';
  const bottomConnectorState: 'active' | 'settled' = phase === 'revealing' ? 'active' : 'settled';
  const panelPhase: 'submitting' | 'revealing' | 'reviewing' = phase === 'reviewing' ? 'reviewing' : phase === 'revealing' ? 'revealing' : 'submitting';
  const showPlanPanel = phase === 'submitting' || phase === 'revealing' || phase === 'reviewing';
  const showSqlBlock = phase === 'submitting' || phase === 'revealing' || phase === 'reviewing';

  const autoCollapsed = showPlanPanel
    && phase === 'reviewing'
    && containerHeight > 0
    && containerHeight < AUTO_COLLAPSE_HEIGHT_PX;
  const isPanelExpanded = manualPanelExpanded ?? !autoCollapsed;

  const activeProvider = useMemo(() => {
    if (result?.provider) {
      return result.provider;
    }

    for (let index = modelWorkBlocks.length - 1; index >= 0; index -= 1) {
      const details = modelWorkBlocks[index]?.details;
      const provider = details ? (details as Record<string, unknown>).provider : null;
      if (isNlProviderInfo(provider)) {
        return provider;
      }
    }

    return null;
  }, [modelWorkBlocks, result?.provider]);

  const togglePanelExpanded = useCallback(() => {
    setManualPanelExpanded((previous) => {
      const current = previous ?? !autoCollapsed;
      return !current;
    });
  }, [autoCollapsed]);

  return (
    <>
      {(showPlanPanel || showSqlBlock) && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <div
              data-testid="nl-flow-connector-top"
              className={cn(
                'overflow-hidden transition-[opacity,flex] ease-out motion-reduce:transition-none',
                showConnector
                  ? 'flex min-h-[2.75rem] flex-1 items-end justify-center opacity-100 duration-400'
                  : 'h-0 opacity-0 duration-200 pointer-events-none',
              )}
            >
              <NlFlowConnector
                stretch
                state={topConnectorState}
                variant="fan-in"
                className={cn('h-full', connectorColorClassName)}
              />
            </div>

            {showPlanPanel && (
              <NlWorkPlanPanel
                explanation={result?.explanation}
                provider={activeProvider}
                phase={panelPhase}
                workPhases={workPhases}
                modelWorkBlocks={modelWorkBlocks}
                isStreaming={phase === 'submitting'}
                isExpanded={isPanelExpanded}
                autoCollapsed={autoCollapsed}
                onToggleExpanded={togglePanelExpanded}
                className="mx-auto w-full max-w-[44rem] shrink-0"
              />
            )}

            <div
              data-testid="nl-flow-connector-bottom"
              className={cn(
                'overflow-hidden transition-[opacity,flex] ease-out motion-reduce:transition-none',
                showConnector
                  ? 'flex min-h-[2.75rem] flex-1 items-start justify-center opacity-100 duration-400'
                  : 'h-0 opacity-0 duration-200 pointer-events-none',
              )}
            >
              <NlFlowConnector
                stretch
                state={bottomConnectorState}
                variant="fan-out"
                className={cn('h-full', connectorColorClassName)}
              />
            </div>
          </div>

          {showSqlBlock && (
            <div
              className={cn(
                'mt-auto shrink-0 min-h-[12rem]',
                'animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out',
              )}
            >
              <SqlRevealBlock
                sql={result?.sql ?? ''}
                queryExecutionError={result?.queryExecutionError}
                isRevealing={phase === 'revealing'}
                visibleTokenCount={visibleTokenCount}
                isRevealComplete={isRevealComplete}
                editedSql={editedSql}
                onSqlChange={onSqlEdit}
                originalSql={result?.sql ?? ''}
                onApprove={onApprove}
                onReject={onReject}
                approveThemeClasses={approveThemeClasses}
                className="h-full"
              />
            </div>
          )}
        </div>
      )}

      {phase === 'error' && errorMessage && (
        <div
          className={cn(
            'mt-2 rounded-md border border-destructive/30 bg-destructive/5',
            'px-3 py-2 text-xs text-destructive',
            'animate-in fade-in slide-in-from-bottom-1 duration-200',
          )}
          role="alert"
        >
          <p className="font-medium">Generation failed</p>
          <p className="mt-0.5 opacity-80">{errorMessage}</p>
          <button
            type="button"
            onClick={onDismissError}
            className="mt-1.5 underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
