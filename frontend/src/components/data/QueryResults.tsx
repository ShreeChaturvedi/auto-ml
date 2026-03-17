/**
 * QueryResults - Execute button footer for QueryPanel
 *
 * Renders the phase-aware footer buttons for SQL execution and
 * NL workflow generation. Extracted from QueryPanel to isolate
 * the action/results area.
 */

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedExecuteIcon, AnimatedBrainIcon } from './AnimatedQueryIcons';
import type { NlQueryWorkflowHandle, NlPhase } from './NlQueryWorkflow';
import type { QueryMode } from '@/types/file';

export interface QueryResultsProps {
  /** Current query mode */
  mode: QueryMode;
  /** Whether a SQL query is currently executing */
  isExecuting: boolean;
  /** Whether the SQL query input is empty */
  isSqlEmpty: boolean;
  /** Whether the English query input is empty */
  isEnglishEmpty: boolean;
  /** Callback to execute the SQL query */
  onExecute: () => void;
  /** Current NL workflow phase */
  nlPhase: NlPhase;
  /** Ref to the NL workflow for triggering generation */
  nlWorkflowRef: React.RefObject<NlQueryWorkflowHandle | null>;
  /** Color class for the execute icon */
  executeIconColorClass: string;
}

export function QueryResults({
  mode,
  isExecuting,
  isSqlEmpty,
  isEnglishEmpty,
  onExecute,
  nlPhase,
  nlWorkflowRef,
  executeIconColorClass,
}: QueryResultsProps) {
  const isNlGenerating = nlPhase === 'submitting' || nlPhase === 'revealing';

  return (
    <div className="px-3 pb-3">
      {mode === 'sql' ? (
        <Button
          variant="secondary"
          onClick={onExecute}
          disabled={isExecuting || isSqlEmpty}
          className="group/execute w-full h-9 text-sm gap-2"
        >
          <AnimatedExecuteIcon
            isExecuting={isExecuting}
            colorClassName={executeIconColorClass}
          />
          {isExecuting ? 'Executing...' : 'Execute'}
        </Button>
      ) : nlPhase !== 'reviewing' ? (
        /* English idle / submitting / revealing / error — trigger generation */
        <Button
          variant="secondary"
          onClick={() => nlWorkflowRef.current?.triggerGenerate()}
          disabled={
            isNlGenerating ||
            isEnglishEmpty
          }
          className="group/execute w-full h-9 text-sm gap-2"
        >
          {isNlGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <AnimatedBrainIcon
                colorClassName={executeIconColorClass}
              />
              Execute
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
