import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Lightbulb } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useDataStore } from '@/stores/dataStore';

interface IntentStageProps {
  projectId: string;
  initialIntent?: string;
  onBack: () => void;
  onSubmit: (intent: string) => void;
}

const DEFAULT_SUGGESTIONS = [
  'Predict a value',
  'Classify outcomes',
  'Find patterns',
  'Explore relationships',
  'Anomaly detection'
];

export function IntentStage({ projectId, initialIntent, onBack, onSubmit }: IntentStageProps) {
  const files = useDataStore((state) => state.files);
  const [intent, setIntent] = useState(initialIntent ?? '');

  const projectFiles = useMemo(
    () => files.filter((file) => file.projectId === projectId),
    [files, projectId]
  );

  const datasetFiles = useMemo(
    () => projectFiles.filter((file) => ['csv', 'json', 'excel'].includes(file.type)),
    [projectFiles]
  );

  const contextFiles = useMemo(
    () => projectFiles.filter((file) => ['pdf', 'markdown', 'word', 'text', 'other'].includes(file.type)),
    [projectFiles]
  );

  const totalRows = useMemo(
    () => datasetFiles.reduce((sum, file) => sum + (file.metadata?.rowCount ?? 0), 0),
    [datasetFiles]
  );

  const suggestions = useMemo(() => {
    const dtypeValues = datasetFiles.flatMap((file) =>
      Object.values(file.metadata?.datasetProfile?.dtypes ?? {})
    );
    const hasCategorical = dtypeValues.some((dtype) => /char|text|str|object|categor/i.test(dtype));
    const hasNumeric = dtypeValues.some((dtype) => /int|float|double|numeric|decimal|number/i.test(dtype));

    if (hasNumeric && !hasCategorical) {
      return ['Predict a value', 'Forecast trends', 'Find correlations', 'Anomaly detection', 'Optimize thresholds'];
    }
    if (hasCategorical && hasNumeric) {
      return DEFAULT_SUGGESTIONS;
    }

    return ['Classify outcomes', 'Cluster similar records', 'Extract themes', 'Find patterns', 'Prioritize signals'];
  }, [datasetFiles]);

  const summary = useMemo(() => {
    const datasetText = `${datasetFiles.length} dataset${datasetFiles.length === 1 ? '' : 's'}`;
    const rowText = totalRows > 0 ? ` (${totalRows.toLocaleString()} rows)` : '';
    const docsText = `${contextFiles.length} context document${contextFiles.length === 1 ? '' : 's'}`;

    return `You uploaded ${datasetText}${rowText} and ${docsText}.`;
  }, [contextFiles.length, datasetFiles.length, totalRows]);

  const trimmedIntent = intent.trim();

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-4 sm:p-6" data-testid="intent-stage">
      <Card className="border-border/80">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl">What are you trying to achieve?</CardTitle>
          <CardDescription>{summary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            placeholder="Describe your project goal. For example: I want to predict customer churn based on usage patterns and demographics, or help classify support tickets by priority."
            className="min-h-[220px]"
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lightbulb className="h-4 w-4" />
              Suggestions
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Badge
                  key={suggestion}
                  variant="outline"
                  className="cursor-pointer rounded-full px-3 py-1 text-xs hover:border-primary hover:text-primary"
                  onClick={() => {
                    setIntent((prev) => {
                      if (!prev.trim()) {
                        return suggestion;
                      }
                      if (prev.includes(suggestion)) {
                        return prev;
                      }
                      return `${prev.trim()}\n- ${suggestion}`;
                    });
                  }}
                >
                  {suggestion}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={() => onSubmit(trimmedIntent)} disabled={!trimmedIntent} className="gap-2">
          Submit
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
