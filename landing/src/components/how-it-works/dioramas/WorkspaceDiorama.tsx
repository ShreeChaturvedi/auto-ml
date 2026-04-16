import type { Phase } from '@frontend/types/phase';

import { PreviewLoop } from '@/components/previews/PreviewLoop';
import type { PreviewLoopId } from '@/components/previews/types';
import styles from './Diorama.module.css';

interface WorkspaceDioramaProps {
  label: string;
  phase: Phase;
  autoplay?: boolean;
  preloadAll?: boolean;
}

const previewIdByPhase: Record<Phase, PreviewLoopId> = {
  upload: 'ingest',
  'data-viewer': 'explore',
  preprocessing: 'preprocess',
  'feature-engineering': 'engineer',
  training: 'train',
  experiments: 'experiments',
  deployment: 'deploy',
};

export function WorkspaceDiorama({
  label,
  phase,
  autoplay = true,
  preloadAll = true,
}: WorkspaceDioramaProps) {
  return (
    <div className={styles.frame}>
      <div className={styles.label}>{label}</div>
      <div className={styles.mockViewport}>
        <PreviewLoop
          previewId={previewIdByPhase[phase]}
          active={autoplay}
          posterOnly={!autoplay}
          preload={preloadAll ? 'auto' : 'metadata'}
          testId={`${previewIdByPhase[phase]}-preview-loop`}
        />
      </div>
    </div>
  );
}
