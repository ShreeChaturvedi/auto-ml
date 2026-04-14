import styles from './Diorama.module.css';

type Phase =
  | 'upload'
  | 'data-viewer'
  | 'preprocessing'
  | 'feature-engineering'
  | 'training'
  | 'experiments'
  | 'deployment';

interface WorkspaceDioramaProps {
  label: string;
  phase: Phase;
}

export function WorkspaceDiorama({ label, phase }: WorkspaceDioramaProps) {
  return (
    <div className={styles.frame}>
      <div className={styles.label}>{label}</div>
      <div className={styles.workspaceViewport}>
        <iframe
          className={`${styles.workspaceFrame} pointer-events-none`}
          src={`/workspace-preview?phase=${encodeURIComponent(phase)}`}
          title={`${label} preview`}
          loading="lazy"
        />
      </div>
    </div>
  );
}
