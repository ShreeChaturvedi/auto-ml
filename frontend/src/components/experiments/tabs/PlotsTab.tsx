import type { EvaluationResult } from '@/types/experiments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5">
      {/* Classification-specific charts */}
      {isClassification && evaluation.confusion_matrix && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Confusion Matrix</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ConfusionMatrixChart data={evaluation.confusion_matrix} />
          </CardContent>
        </Card>
      )}

      {isClassification && evaluation.roc_curves && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">ROC Curve</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <RocCurveChart data={evaluation.roc_curves} />
          </CardContent>
        </Card>
      )}

      {isClassification && evaluation.precision_recall_curves && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Precision-Recall Curve</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <PrCurveChart data={evaluation.precision_recall_curves} />
          </CardContent>
        </Card>
      )}

      {isClassification && evaluation.calibration_curve && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Calibration Curve</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <CalibrationChart data={evaluation.calibration_curve} />
          </CardContent>
        </Card>
      )}

      {/* Regression-specific charts */}
      {isRegression && evaluation.residuals && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Residuals vs Predicted</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResidualsChart data={evaluation.residuals} />
          </CardContent>
        </Card>
      )}

      {isRegression && evaluation.residual_histogram && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Residual Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResidualHistogramChart data={evaluation.residual_histogram} />
          </CardContent>
        </Card>
      )}

      {/* Shared charts (classification + regression) */}
      {evaluation.learning_curve && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Learning Curve</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <LearningCurveChart data={evaluation.learning_curve} />
          </CardContent>
        </Card>
      )}

      {evaluation.cross_validation && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Cross-Validation Scores</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <CvBoxplot data={evaluation.cross_validation} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
