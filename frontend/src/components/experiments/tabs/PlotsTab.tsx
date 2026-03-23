import type { EvaluationResult } from '@/types/experiments';
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 px-1">Performance</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {evaluation.confusion_matrix && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Confusion Matrix</p>
                  <ConfusionMatrixChart data={evaluation.confusion_matrix} />
                </div>
              )}
              {evaluation.roc_curves && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">ROC Curve</p>
                  <RocCurveChart data={evaluation.roc_curves} />
                </div>
              )}
              {evaluation.precision_recall_curves && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Precision-Recall Curve</p>
                  <PrCurveChart data={evaluation.precision_recall_curves} />
                </div>
              )}
              {evaluation.calibration_curve && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Calibration Curve</p>
                  <CalibrationChart data={evaluation.calibration_curve} />
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 px-1">Learning</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {evaluation.learning_curve && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Learning Curve</p>
                  <LearningCurveChart data={evaluation.learning_curve} />
                </div>
              )}
              {evaluation.cross_validation && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Cross-Validation Scores</p>
                  <CvBoxplot data={evaluation.cross_validation} />
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Regression sections */}
      {isRegression && (
        <>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 px-1">Error Analysis</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {evaluation.residuals && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Residuals vs Predicted</p>
                  <ResidualsChart data={evaluation.residuals} />
                </div>
              )}
              {evaluation.residual_histogram && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Residual Distribution</p>
                  <ResidualHistogramChart data={evaluation.residual_histogram} />
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 px-1">Learning</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {evaluation.learning_curve && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Learning Curve</p>
                  <LearningCurveChart data={evaluation.learning_curve} />
                </div>
              )}
              {evaluation.cross_validation && (
                <div className="rounded-lg border border-border/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Cross-Validation Scores</p>
                  <CvBoxplot data={evaluation.cross_validation} />
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
