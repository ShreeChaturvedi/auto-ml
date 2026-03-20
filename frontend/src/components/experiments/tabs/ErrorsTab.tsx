import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useModelStore } from '@/stores/modelStore';
import type { EvaluationResult } from '@/types/experiments';
import { AlertTriangle, TreePine } from 'lucide-react';
import { ErrorTreeNodeCard } from './ErrorTreeNodeCard';

interface ErrorsTabProps {
  modelId: string;
  evaluation: EvaluationResult;
}

function SkeletonBlock({ height = 200 }: { height?: number }) {
  return <div className="timeline-skeleton rounded-md" style={{ height }} />;
}

type SortDir = 'asc' | 'desc';

function MisclassificationTable({
  data,
}: {
  data: Array<{ index: number; y_true: string; y_pred: string; confidence: number }>;
}) {
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => (sortDir === 'desc' ? b.confidence - a.confidence : a.confidence - b.confidence));
    return copy;
  }, [data, sortDir]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Index</th>
            <th className="px-3 py-2 font-medium">True Label</th>
            <th className="px-3 py-2 font-medium">Predicted Label</th>
            <th className="px-3 py-2 font-medium">
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                Confidence
                <span className="text-xs">{sortDir === 'desc' ? '\u2193' : '\u2191'}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={`${row.index}-${i}`} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.index}</td>
              <td className="px-3 py-2 font-medium">{row.y_true}</td>
              <td className="px-3 py-2 font-medium text-destructive">{row.y_pred}</td>
              <td className="px-3 py-2 tabular-nums">{(row.confidence * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No misclassifications found.</p>
      )}
    </div>
  );
}

function ErrorNarrative({ projectId, errorAnalysis }: { projectId: string; errorAnalysis: Record<string, unknown> }) {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchNarrative() {
      setIsLoading(true);
      setFailed(false);
      setText('');
      try {
        const { fetchInsights } = await import('@/lib/api/experiments');
        const { accumulateTokenStream } = await import('@/lib/api/streamReader');
        const response = await fetchInsights(projectId, { type: 'error_narrative', context: { errorAnalysis } });
        await accumulateTokenStream(response, (accumulated) => {
          if (!controller.signal.aborted) setText(accumulated);
        }, controller.signal);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    fetchNarrative();
    return () => { controller.abort(); };
  }, [projectId, errorAnalysis]);

  if (failed && !text) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Error Narrative</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !text ? (
          <SkeletonBlock height={60} />
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {text}
            {isLoading && <span className="inline-block w-2 h-4 ml-0.5 bg-foreground/60 animate-pulse rounded-sm" />}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ErrorsTab({ modelId, evaluation }: ErrorsTabProps) {
  const fetchErrorAnalysis = useExperimentsStore((s) => s.fetchErrorAnalysis);
  const errorAnalysis = useExperimentsStore((s) => s.errorAnalysis[modelId]);
  const projectId = useModelStore((s) => s.models.find((m) => m.modelId === modelId)?.projectId ?? '');

  useEffect(() => { fetchErrorAnalysis(modelId); }, [modelId, fetchErrorAnalysis]);

  const isClassification = evaluation.taskType === 'classification';
  const isLoading = errorAnalysis === undefined;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 p-4">
        <SkeletonBlock height={200} />
        {isClassification && <SkeletonBlock height={300} />}
      </div>
    );
  }

  if (!errorAnalysis) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Prediction data unavailable for this model.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TreePine className="h-4 w-4" />
            Error Tree
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Decision tree trained on prediction errors to identify which feature combinations lead to mistakes.
          </p>
        </CardHeader>
        <CardContent>
          {errorAnalysis.error_tree ? (
            <ErrorTreeNodeCard node={errorAnalysis.error_tree} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Error tree not available.</p>
          )}
        </CardContent>
      </Card>

      {isClassification && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Misclassifications
              {errorAnalysis.misclassifications && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (top {errorAnalysis.misclassifications.length} by confidence)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {errorAnalysis.misclassifications && errorAnalysis.misclassifications.length > 0 ? (
              <MisclassificationTable data={errorAnalysis.misclassifications} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Misclassification data not available.</p>
            )}
          </CardContent>
        </Card>
      )}

      {projectId && (
        <ErrorNarrative projectId={projectId} errorAnalysis={errorAnalysis as unknown as Record<string, unknown>} />
      )}
    </div>
  );
}
