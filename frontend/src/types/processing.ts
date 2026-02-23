/**
 * Processing result types for the compute animation stage
 *
 * These types describe the results gathered from uploaded files
 * during the PROCESSING stage of the upload flow. They power
 * the result cards displayed alongside the compute animation.
 */

export type ProcessingResultType =
  | 'dataset_stats'
  | 'document_chunks'
  | 'schema_analysis'
  | 'quality_check';

export interface ProcessingResult {
  /** Category of the result for icon/color treatment */
  type: ProcessingResultType;
  /** Display emoji or lucide icon name */
  icon: string;
  /** Primary label, e.g. "2,847 rows × 14 columns" */
  label: string;
  /** Optional secondary detail line */
  detail?: string;
}

/**
 * Props contract for the ProcessingStage orchestrator.
 * Designed for easy integration with the UploadArea stage machine.
 */
export interface ProcessingStageProps {
  projectId: string;
  onComplete: (results: ProcessingResult[]) => void;
  onBack?: () => void;
}

/**
 * Props for the ComputeAnimation SVG component.
 */
export interface ComputeAnimationProps {
  /** Uploaded file descriptors (name + type) for left-side icons */
  files: Array<{ name: string; type: string }>;
  /** Processing results to render as right-side cards */
  results: ProcessingResult[];
  /** When true, the mesh settles and a completion indicator appears */
  isComplete: boolean;
  /** Fired once all entrance + completion animations have finished */
  onSettled?: () => void;
}
