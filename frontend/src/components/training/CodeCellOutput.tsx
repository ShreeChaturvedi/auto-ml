import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import type { RichOutput } from '@/lib/api/execution';
import { CellOutputRenderer } from './CellOutputRenderer';
import { buildOutputCopyText } from './cellOutputUtils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

interface CodeCellOutputProps {
  richOutputs: RichOutput[];
}

export function CodeCellOutput({ richOutputs }: CodeCellOutputProps) {
  const [showOutput, setShowOutput] = useState(true);
  const [outputCopied, copyOutput] = useCopyToClipboard();

  const handleCopyOutput = async () => {
    const text = buildOutputCopyText(richOutputs);
    if (text) await copyOutput(text);
  };

  if (richOutputs.length === 0) {
    return null;
  }

  return (
    <div className="border-t">
      <div className="flex min-h-[32px] items-center justify-between px-2 py-2">
        <button
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowOutput(!showOutput)}
          type="button"
          aria-label={showOutput ? 'Collapse output' : 'Expand output'}
        >
          {showOutput ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span>{showOutput ? 'Collapse output' : 'Expand output'}</span>
        </button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11px]"
          onClick={handleCopyOutput}
          title="Copy output"
          aria-label="Copy output"
          type="button"
        >
          {outputCopied ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy output</span>
            </>
          )}
        </Button>
      </div>

      {showOutput && (
        <div className="px-3 pb-2">
          <CellOutputRenderer outputs={richOutputs} />
        </div>
      )}
    </div>
  );
}
