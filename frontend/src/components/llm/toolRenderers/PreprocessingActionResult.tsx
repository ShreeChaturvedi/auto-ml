import { Bookmark } from 'lucide-react';
import type { ToolCall } from '@/types/llmUi';
import { asBoolean, asRecord, asString } from '@/lib/typeCoercion';
import { StatusPill } from '@/components/llm/shared/StatusPill';
import { GenericJsonResult } from './GenericJsonResult';

export function PreprocessingActionResult({ call, output }: { call: ToolCall; output: unknown }) {
  const out = asRecord(output);
  const checkpointId = asString(out.checkpointId);
  const compatible = asBoolean(out.compatible);

  if (call.tool === 'checkpoint_dataset') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Dataset checkpoint created</span>
          {compatible != null && (
            <StatusPill
              status={compatible ? 'success' : 'pending'}
              label={compatible ? 'replay compatible' : 'needs review'}
              className="ml-auto"
            />
          )}
        </div>
        {checkpointId && (
          <p className="text-[11px] text-muted-foreground">
            ID: <span className="font-mono text-foreground">{checkpointId}</span>
          </p>
        )}
      </div>
    );
  }

  // Defensive fallback for the (in practice) unreachable tool names —
  // `useLifecycleCards.ts` intercepts them before this renderer runs.
  return <GenericJsonResult output={output} />;
}
