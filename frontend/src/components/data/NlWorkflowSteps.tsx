/**
 * NlWorkflowSteps - Workflow step display for NL query generation
 *
 * Renders the connector lines, stream panel, SQL editor,
 * and error display for the natural-language query workflow.
 */

import { useCallback, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { NlFlowConnector } from './NlFlowConnector';
import { NlStreamPanel } from './NlStreamPanel';
import { NlSqlEditor } from './NlSqlEditor';
import type { ApproveThemeClasses, NlPhase } from './NlQueryReducer';
import type {
  NlGenerationResult,
  NlModelWorkBlockState,
} from '@/types/nlQuery';

const AUTO_COLLAPSE_HEIGHT_PX = 920;

export interface NlWorkflowStepsProps {
  phase: NlPhase;
  result: NlGenerationResult | null;
  editedSql: string;
  onSqlEdit: (sql: string) => void;
  errorMessage: string | null;
  onDismissError: () => void;
  onApprove: () => void;
  onReject: () => void;
  modelWorkBlocks: NlModelWorkBlockState[];
  onRevealComplete: () => void;
  approveThemeClasses?: ApproveThemeClasses;
  connectorColorClassName?: string;
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
  modelWorkBlocks,
  onRevealComplete,
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

  const showConnector = phase === 'submitting' || phase === 'revealing' || phase === 'reviewing';
  const topConnectorState: 'active' | 'settled' = phase === 'submitting' ? 'active' : 'settled';
  const bottomConnectorState: 'active' | 'settled' = phase === 'revealing' ? 'active' : 'settled';
  const showStreamPanel = phase === 'submitting' || phase === 'revealing' || phase === 'reviewing';
  const showSqlBlock = phase === 'submitting' || phase === 'revealing' || phase === 'reviewing';

  const sqlEditorPhase: 'generating' | 'revealing' | 'reviewing' =
    phase === 'revealing' ? 'revealing'
      : phase === 'reviewing' ? 'reviewing'
        : 'generating';

  const autoCollapsed = showStreamPanel
    && phase === 'reviewing'
    && containerHeight > 0
    && containerHeight < AUTO_COLLAPSE_HEIGHT_PX;
  const isPanelExpanded = manualPanelExpanded ?? !autoCollapsed;

  const togglePanelExpanded = useCallback(() => {
    setManualPanelExpanded((previous) => {
      const current = previous ?? !autoCollapsed;
      return !current;
    });
  }, [autoCollapsed]);

  return (
    <>
      {(showStreamPanel || showSqlBlock) && (
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

            {showStreamPanel && (
              <NlStreamPanel
                modelWorkBlocks={modelWorkBlocks}
                isStreaming={phase === 'submitting'}
                isExpanded={isPanelExpanded}
                autoCollapsed={autoCollapsed}
                onToggleExpanded={togglePanelExpanded}
                containerHeight={containerHeight}
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
              <NlSqlEditor
                sql={result?.sql ?? ''}
                phase={sqlEditorPhase}
                editedSql={editedSql}
                onSqlChange={onSqlEdit}
                originalSql={result?.sql ?? ''}
                onApprove={onApprove}
                onReject={onReject}
                onRevealComplete={onRevealComplete}
                approveThemeClasses={approveThemeClasses}
                queryExecutionError={result?.queryExecutionError}
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
