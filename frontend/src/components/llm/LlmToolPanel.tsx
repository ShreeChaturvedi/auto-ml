import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ToolCallState {
  call: ToolCall;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: ToolResult;
}

interface LlmToolPanelProps {
  toolCalls: ToolCall[];
  results: ToolResult[];
  isRunning: boolean;
  approvalGranted: boolean;
  onApprove: () => void;
  onRun: () => void;
}

export function LlmToolPanel({
  toolCalls,
  results,
  isRunning,
  approvalGranted,
  onApprove,
  onRun
}: LlmToolPanelProps) {
  const formatJson = (value: unknown) => {
    let text = '';
    if (typeof value === 'string') {
      text = value;
    } else {
      try {
        text = JSON.stringify(value, null, 2);
      } catch {
        text = String(value);
      }
    }
    if (text.length > 2000) {
      return `${text.slice(0, 2000)}…`;
    }
    return text;
  };

  const toolStates = useMemo<ToolCallState[]>(() => {
    return toolCalls.map((call) => {
      const result = results.find((item) => item.id === call.id);
      if (!result) {
        return { call, status: isRunning ? 'running' : 'pending' };
      }
      return {
        call,
        status: result.error ? 'error' : 'done',
        result
      };
    });
  }, [toolCalls, results, isRunning]);

  if (toolCalls.length === 0) return null;

  return (
    <Card className="border border-dashed bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Tool calls requested</p>
          <p className="text-xs text-muted-foreground">
            The assistant wants to run tools to gather more context.
          </p>
        </div>
        {!approvalGranted && (
          <Button variant="outline" size="sm" onClick={onApprove}>
            Allow tools
          </Button>
        )}
        {approvalGranted && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRun}
            disabled={isRunning}
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Run tools'}
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        {toolStates.map(({ call, status, result }) => (
          <div
            key={call.id}
            className={cn(
              'rounded-md border px-3 py-2 text-xs',
              status === 'error' && 'border-destructive/40 text-destructive',
              status === 'done' && 'border-emerald-500/30 text-emerald-600',
              status === 'running' && 'border-foreground/10'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{call.tool}</span>
              <span className="flex items-center gap-1">
                {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                {status === 'done' && <CheckCircle className="h-3 w-3" />}
                {status === 'error' && <AlertCircle className="h-3 w-3" />}
                <Badge variant="outline" className="text-[10px] uppercase">
                  {status}
                </Badge>
              </span>
            </div>
            {call.rationale && <p className="mt-1 text-[11px] text-muted-foreground">{call.rationale}</p>}
            {result?.error && <p className="mt-1 text-[11px]">{String(result.error)}</p>}
            {(Boolean(call.args) || Boolean(result?.output)) && (
              <div className="mt-2 space-y-2 text-[11px] text-muted-foreground">
                {call.args && (
                  <details>
                    <summary className="cursor-pointer font-medium text-foreground/80">Args</summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-[10px] text-muted-foreground">
                      {formatJson(call.args)}
                    </pre>
                  </details>
                )}
                {Boolean(result?.output) && (
                  <details>
                    <summary className="cursor-pointer font-medium text-foreground/80">Output</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/50 p-2 text-[10px] text-muted-foreground">
                      {formatJson(result?.output as Record<string, unknown>)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
