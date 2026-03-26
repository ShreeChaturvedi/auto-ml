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

interface PlotsTabProps {
  evaluation: EvaluationResult;
}

export function PlotsTab({ evaluation }: PlotsTabProps) {
  const isClassification = evaluation.taskType === 'classification';
  const isRegression = evaluation.taskType === 'regression';

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
    </div>
  );
}
