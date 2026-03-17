/**
 * CodeGenerationCard - Displays generated code with syntax highlighting.
 *
 * Provides expand/collapse toggle and a copy-to-clipboard button.
 * Uses a <pre><code> block with a CSS class for optional syntax highlighting.
 */

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface CodeGenerationCardProps {
  code: string;
  language?: string;
  expanded?: boolean;
}

export function CodeGenerationCard({
  code,
  language = 'python',
  expanded: initialExpanded = false,
}: CodeGenerationCardProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [code]);

  const lineCount = code.split('\n').length;
  const preview = code.split('\n').slice(0, 3).join('\n');

  return (
    <div className="rounded-md border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span className="font-medium">Generated code</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {language} &middot; {lineCount} lines
          </span>
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-5 w-5"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Code block */}
      <div
        className={cn(
          'overflow-hidden transition-[max-height] duration-200',
          expanded ? 'max-h-[500px]' : 'max-h-[4.5rem]',
        )}
      >
        <pre className="overflow-auto p-3 text-xs leading-relaxed">
          <code className={`language-${language}`}>
            {expanded ? code : preview + (lineCount > 3 ? '\n...' : '')}
          </code>
        </pre>
      </div>
    </div>
  );
}
