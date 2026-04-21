import type { EvaluationResult } from '@/types/experiments';
import { ChartCard } from '../shared/ChartCard';
import { ConfusionMatrixChart } from '../charts/ConfusionMatrixChart';
import { RocCurveChart } from '../charts/RocCurveChart';
import { PrCurveChart } from '../charts/PrCurveChart';
import { CalibrationChart } from '../charts/CalibrationChart';
import { LearningCurveChart } from '../charts/LearningCurveChart';
import { CvBoxplot } from '../charts/CvBoxplot';
import { ResidualsChart } from '../charts/ResidualsChart';
import { ResidualHistogramChart } from '../charts/ResidualHistogramChart';
import { MiniBars } from '../charts/MiniBars';

interface PlotsTabProps {
  evaluation: EvaluationResult;
}

export function PlotsTab({ evaluation }: PlotsTabProps) {
  const isClassification = evaluation.taskType === 'classification';
  const isRegression = evaluation.taskType === 'regression';
  const isClustering = evaluation.taskType === 'clustering';
  const clusterSizeItems = Object.entries(evaluation.clustering_metrics?.cluster_sizes ?? {}).map(([label, value]) => ({
    label,
    value,
  }));

  return (
    <div className="space-y-8 p-5">
      {/* Classification sections */}
      {isClassification && (
        <>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-4 px-1">Performance</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {evaluation.confusion_matrix && (
                <ChartCard label="Confusion Matrix" delay={0}>
                  <ConfusionMatrixChart data={evaluation.confusion_matrix} />
                </ChartCard>
              )}
              {evaluation.roc_curves && (
                <ChartCard label="ROC Curve" delay={50}>
                  <RocCurveChart data={evaluation.roc_curves} />
                </ChartCard>
              )}
              {evaluation.precision_recall_curves && (
                <ChartCard label="Precision-Recall Curve" delay={100}>
                  <PrCurveChart data={evaluation.precision_recall_curves} />
                </ChartCard>
              )}
              {evaluation.calibration_curve && (
                <ChartCard label="Calibration Curve" delay={150}>
                  <CalibrationChart data={evaluation.calibration_curve} />
                </ChartCard>
              )}
            </div>
          </section>

          <section className="border-t border-border/10 pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-4 px-1">Learning</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {evaluation.learning_curve && (
                <ChartCard label="Learning Curve" delay={0}>
                  <LearningCurveChart data={evaluation.learning_curve} />
                </ChartCard>
              )}
              {evaluation.cross_validation && (
                <ChartCard label="Cross-Validation Scores" delay={50}>
                  <CvBoxplot data={evaluation.cross_validation} />
                </ChartCard>
              )}
            </div>
          </section>
        </>
      )}

      {/* Regression sections */}
      {isRegression && (
        <>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-4 px-1">Error Analysis</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {evaluation.residuals && (
                <ChartCard label="Residuals vs Predicted" delay={0}>
                  <ResidualsChart data={evaluation.residuals} />
                </ChartCard>
              )}
              {evaluation.residual_histogram && (
                <ChartCard label="Residual Distribution" delay={50}>
                  <ResidualHistogramChart data={evaluation.residual_histogram} />
                </ChartCard>
              )}
            </div>
          </section>

          <section className="border-t border-border/10 pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-4 px-1">Learning</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {evaluation.learning_curve && (
                <ChartCard label="Learning Curve" delay={0}>
                  <LearningCurveChart data={evaluation.learning_curve} />
                </ChartCard>
              )}
              {evaluation.cross_validation && (
                <ChartCard label="Cross-Validation Scores" delay={50}>
                  <CvBoxplot data={evaluation.cross_validation} />
                </ChartCard>
              )}
            </div>
          </section>
        </>
      )}

      {isClustering && evaluation.clustering_metrics && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-4 px-1">Clusters</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard label="Cluster Summary" delay={0}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Clusters</p>
                  <p className="mt-1 text-lg font-semibold">{evaluation.clustering_metrics.n_clusters}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Silhouette</p>
                  <p className="mt-1 text-lg font-semibold">
                    {evaluation.clustering_metrics.silhouette == null
                      ? '—'
                      : evaluation.clustering_metrics.silhouette.toFixed(3)}
                  </p>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Davies-Bouldin</p>
                  <p className="mt-1 text-lg font-semibold">
                    {evaluation.clustering_metrics.davies_bouldin == null
                      ? '—'
                      : evaluation.clustering_metrics.davies_bouldin.toFixed(3)}
                  </p>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Calinski-Harabasz</p>
                  <p className="mt-1 text-lg font-semibold">
                    {evaluation.clustering_metrics.calinski_harabasz == null
                      ? '—'
                      : evaluation.clustering_metrics.calinski_harabasz.toFixed(3)}
                  </p>
                </div>
              </div>
            </ChartCard>

            <ChartCard label="Cluster Sizes" delay={50}>
              {clusterSizeItems.length > 0 ? (
                <div className="space-y-4">
                  <MiniBars items={clusterSizeItems} />
                  <div className="space-y-2">
                    {clusterSizeItems.map((item) => (
                      <div key={item.label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Cluster {item.label}</span>
                        <span className="font-medium tabular-nums">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Cluster-size details were not available for this run.</p>
              )}
            </ChartCard>
          </div>
        </section>
      )}
    </div>
  );
}
