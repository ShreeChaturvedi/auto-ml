import { Markdown } from '@/components/ui/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Check, Copy } from 'lucide-react';
import type { UiItem } from '@/types/llmUi';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { FeatureSuggestionCard } from './FeatureSuggestionCard';
import type { FeatureSuggestionItem } from './featureEngineeringUtils';
import type { SuggestionDraft } from './hooks/useFeaturePipelineState';

interface FeatureUiItemRendererProps {
  item: UiItem;
  datasetColumns: string[];
  suggestionDrafts: Record<string, SuggestionDraft>;
  featureById: Map<string, { enabled?: boolean; params?: Record<string, unknown> }>;
  onToggleSuggestion: (item: FeatureSuggestionItem, enabled: boolean) => void;
  onUpdateSuggestionControl: (item: FeatureSuggestionItem, key: string, value: unknown) => void;
}

export function FeatureUiItemRenderer({
  item,
  datasetColumns,
  suggestionDrafts,
  onToggleSuggestion,
  onUpdateSuggestionControl
}: FeatureUiItemRendererProps) {
  const [codeCopied, copyCode] = useCopyToClipboard();

  switch (item.type) {
    case 'dataset_summary':
      return (
        <Card key={item.datasetId} className="border-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dataset snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{item.filename}</span>
              <Badge variant="outline" className="text-[10px]">
                {item.rows} rows
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>{item.columns} columns</span>
              <Badge variant="secondary" className="text-[10px]">
                {item.datasetId.slice(0, 8)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      );

    case 'report':
      return (
        <Card key={item.id} className="border-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{item.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {item.format === 'json' ? (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">
                {item.content}
              </pre>
            ) : (
              <Markdown className="prose prose-sm max-w-none dark:prose-invert">
                {item.content}
              </Markdown>
            )}
          </CardContent>
        </Card>
      );

    case 'feature_suggestion':
      return (
        <FeatureSuggestionCard
          key={item.id}
          item={item}
          draft={suggestionDrafts[item.id]}
          datasetColumns={datasetColumns}
          onToggle={onToggleSuggestion}
          onControlChange={onUpdateSuggestionControl}
        />
      );

    case 'code_cell':
      return (
        <Card key={item.id} className="border-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{item.title ?? 'Code cell'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {item.content}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void copyCode(item.content)}
            >
              {codeCopied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {codeCopied ? 'Copied!' : 'Copy code'}
            </Button>
          </CardContent>
        </Card>
      );

    case 'callout':
      return (
        <div
          key={item.text}
          className={cn(
            'rounded-md border px-3 py-2 text-xs',
            item.tone === 'warning' && 'border-amber-500/40 text-amber-700',
            item.tone === 'success' && 'border-emerald-500/40 text-emerald-700',
            item.tone === 'info' && 'border-sky-500/30 text-sky-700'
          )}
        >
          {item.text}
        </div>
      );

    default:
      return null;
  }
}
