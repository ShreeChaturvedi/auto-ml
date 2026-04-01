import { useCallback, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { CellOutputRenderer } from '@/components/training/CellOutputRenderer';
import { buildOutputCopyText } from '@/components/training/cellOutputUtils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import type { RichOutput } from '@/lib/api/execution';

interface NotebookCellOutputProps {
  outputs: RichOutput[];
}

export function NotebookCellOutput({ outputs }: NotebookCellOutputProps) {
  const [showOutput, setShowOutput] = useState(true);
  const [outputCopied, copyOutput] = useCopyToClipboard();

  const handleCopyOutput = useCallback(async () => {
    const text = buildOutputCopyText(outputs);
    if (text) {
      await copyOutput(text);
    }
  }, [copyOutput, outputs]);

  if (outputs.length === 0) {
    return null;
  }

  return (
    <div className="border-t bg-muted/30">
      <div className="flex min-h-[32px] items-center justify-between border-b px-3 py-1.5">
        <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">OUTPUT</span>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-6 w-6 [&_svg]:scale-[0.92]"
                onClick={handleCopyOutput}
                aria-label={outputCopied ? 'Copied output!' : 'Copy output'}
                type="button"
              >
                {outputCopied ? (
                  <Check className="text-green-500" />
                ) : (
                  <Copy />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{outputCopied ? 'Copied output!' : 'Copy output'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-6 w-6"
                onClick={() => setShowOutput((previous) => !previous)}
                aria-label={showOutput ? 'Collapse output' : 'Expand output'}
                type="button"
              >
                {showOutput ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{showOutput ? 'Collapse output' : 'Expand output'}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {showOutput && (
        <div className="p-3">
          <CellOutputRenderer outputs={outputs} />
        </div>
      )}
    </div>
  );
}
