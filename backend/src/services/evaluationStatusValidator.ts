/**
 * Evaluation status validation service
 * Checks if a model's evaluation is ready for analysis operations
 */

/**
 * Evaluation status types that prevent error analysis
 */
export type BlockingEvaluationStatus = 'pending' | 'computing' | 'failed';

/**
 * Validate if evaluation is ready for error analysis
 * @param evaluationStatus - The evaluation status to check
 * @returns Error message if invalid, undefined if valid
 */
export function validateEvaluationForErrorAnalysis(
  evaluationStatus: string | undefined,
): string | undefined {
  if (evaluationStatus === 'pending' || evaluationStatus === 'computing') {
    return 'Evaluation still in progress';
  }
  if (evaluationStatus === 'failed') {
    return 'Evaluation failed; error analysis unavailable';
  }
  return undefined;
}
