/**
 * CodeGenerationCard — generated / materialized code with Monaco highlighting.
 *
 * Chrome is owned by `ToolCardShell` (no custom border, no custom header
 * background). The language label is removed; only a `{n} lines` line-count
 * indicator remains. Copy is a ghost icon button in the shell's `actions` slot.
 */

import { Code2, Copy, Check } from 'lucide-react';
import { useMemo } from 'react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Button } from '@/components/ui/button';
import { ToolCardShell } from '@/components/llm/shared/ToolCardShell';
import { CodeBlock } from '@/components/llm/shared/CodeBlock';

export interface CodeGenerationCardProps {
  code: string;
  language?: string;
  expanded?: boolean;
}

export function CodeGenerationCard({
  code,
  language = 'python',
  expanded = false,
}: CodeGenerationCardProps) {
  const [copied, copy] = useCopyToClipboard();
  const lineCount = useMemo(() => code.split('\n').length, [code]);

  const subtitle = (
    <span className="text-muted-foreground/80">
      <span className="font-mono tabular-nums">{lineCount}</span> line{lineCount === 1 ? '' : 's'}
    </span>
  );

  const copyButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="h-5 w-5"
      onClick={() => void copy(code)}
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? (
        <Check className="h-3 w-3 text-metric-positive" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );

  return (
    <ToolCardShell
      icon={Code2}
      iconClassName="text-muted-foreground"
      title="Generated code"
      subtitle={subtitle}
      actions={copyButton}
      expandable
      defaultExpanded={expanded}
    >
      <CodeBlock code={code} language={language} maxHeight={500} />
    </ToolCardShell>
  );
}
