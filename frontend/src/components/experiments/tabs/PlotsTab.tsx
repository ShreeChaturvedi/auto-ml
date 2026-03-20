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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
      {/* Classification-specific charts */}
      {isClassification && evaluation.confusion_matrix && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Confusion Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfusionMatrixChart data={evaluation.confusion_matrix} />
          </CardContent>
        </Card>
      )}

      {isClassification && evaluation.roc_curves && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ROC Curve</CardTitle>
          </CardHeader>
          <CardContent>
            <RocCurveChart data={evaluation.roc_curves} />
          </CardContent>
        </Card>
      )}

      {isClassification && evaluation.precision_recall_curves && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Precision-Recall Curve</CardTitle>
          </CardHeader>
          <CardContent>
            <PrCurveChart data={evaluation.precision_recall_curves} />
          </CardContent>
        </Card>
      )}

      {isClassification && evaluation.calibration_curve && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Calibration Curve</CardTitle>
          </CardHeader>
          <CardContent>
            <CalibrationChart data={evaluation.calibration_curve} />
          </CardContent>
        </Card>
      )}

      {/* Regression-specific charts */}
      {isRegression && evaluation.residuals && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Residuals vs Predicted</CardTitle>
          </CardHeader>
          <CardContent>
            <ResidualsChart data={evaluation.residuals} />
          </CardContent>
        </Card>
      )}

      {isRegression && evaluation.residual_histogram && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Residual Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResidualHistogramChart data={evaluation.residual_histogram} />
          </CardContent>
        </Card>
      )}

      {/* Shared charts (classification + regression) */}
      {evaluation.learning_curve && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Learning Curve</CardTitle>
          </CardHeader>
          <CardContent>
            <LearningCurveChart data={evaluation.learning_curve} />
          </CardContent>
        </Card>
      )}

      {evaluation.cross_validation && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cross-Validation Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <CvBoxplot data={evaluation.cross_validation} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
