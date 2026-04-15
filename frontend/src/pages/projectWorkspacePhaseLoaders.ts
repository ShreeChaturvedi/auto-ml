import type { Phase } from '@/types/phase';

export const loadUploadArea = () =>
  import('@/components/upload/UploadArea').then((m) => ({ default: m.UploadArea }));

export const loadDataViewerTab = () =>
  import('@/components/data/DataViewerTab').then((m) => ({ default: m.DataViewerTab }));

export const loadPreprocessingPanel = () =>
  import('@/components/preprocessing/PreprocessingPanel').then((m) => ({ default: m.PreprocessingPanel }));

export const loadFeatureEngineeringPanel = () =>
  import('@/components/features/FeatureEngineeringPanel').then((m) => ({ default: m.FeatureEngineeringPanel }));

export const loadTrainingPanel = () =>
  import('@/components/training/TrainingPanel').then((m) => ({ default: m.TrainingPanel }));

export function preloadProjectWorkspacePhase(phase: Phase): Promise<unknown> | undefined {
  switch (phase) {
    case 'upload':
      return loadUploadArea();
    case 'data-viewer':
      return loadDataViewerTab();
    case 'preprocessing':
      return loadPreprocessingPanel();
    case 'feature-engineering':
      return loadFeatureEngineeringPanel();
    case 'training':
      return loadTrainingPanel();
    default:
      return undefined;
  }
}
